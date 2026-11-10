// =====================================================================================
// ATHLETE 3.0 · Nutrición Pro: reconocer el platillo de una foto (Claude, 2026-11-09)
//
// La IA SOLO reconoce qué hay en el plato y la porción, expresada en equivalentes del SMAE. Las kcal y los
// macros los calcula la app con la tabla SMAE (packages/domain/src/smae.ts): la cuenta es nuestra.
//
// - La foto llega en el cuerpo, se manda al proveedor y se descarta: no se escribe en Storage, base ni logs.
// - Las llaves viven aquí como secretos del proyecto, nunca en la app:
//     CF_ACCOUNT_ID + CF_API_TOKEN   → Cloudflare Workers AI (gratis ~10 000 neurons/día)   [primero]
//     GROQ_API_KEY                   → Groq (nivel gratis)                                   [respaldo]
//   Modelos opcionales: CF_MODEL, GROQ_MODEL. Límite: LIMITE_FOTOS_DIA (25 por defecto).
// - Exige sesión: usa el token del usuario y consume su cuota diaria en la base.
// =====================================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const LIMITE = Number(Deno.env.get('LIMITE_FOTOS_DIA') ?? '25');
const MAX_BASE64 = 3_000_000; // ~2.2 MB de imagen; la app la manda reducida a ~1024 px
const GRUPOS = [
  'verduras', 'frutas', 'cereales_sin_grasa', 'cereales_con_grasa', 'leguminosas', 'aoa_muy_bajo', 'aoa_bajo', 'aoa_moderado', 'aoa_alto',
  'leche_descremada', 'leche_semidescremada', 'leche_entera', 'leche_con_azucar', 'grasas_sin_proteina', 'grasas_con_proteina',
  'azucares_sin_grasa', 'azucares_con_grasa', 'libres',
];

const responder = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const INSTRUCCION = `Eres nutriólogo en México y conoces el Sistema Mexicano de Alimentos Equivalentes (SMAE).
Mira la foto y di qué platillos hay y CUÁNTO de cada uno se ve, expresado en equivalentes SMAE.
No calcules calorías ni macros: solo reconoce y cuenta equivalentes.

Grupos permitidos (usa exactamente estas claves):
- verduras (½ taza cocida), frutas (1 pieza chica), cereales_sin_grasa (1 tortilla de maíz, ⅓ taza de arroz, ½ bolillo),
  cereales_con_grasa (1 tortilla de harina, pan dulce, galletas), leguminosas (½ taza de frijol/lenteja),
- aoa_muy_bajo (40 g pechuga, atún en agua, claras), aoa_bajo (30 g bistec, queso fresco), aoa_moderado (1 huevo, carne molida, queso Oaxaca),
  aoa_alto (chorizo, chicharrón, queso amarillo, carnitas, pastor),
- leche_descremada, leche_semidescremada, leche_entera, leche_con_azucar (1 taza),
- grasas_sin_proteina (1 cdita de aceite, ⅓ aguacate, crema), grasas_con_proteina (cacahuates, almendras),
- azucares_sin_grasa (2 cditas de azúcar, refresco), azucares_con_grasa (cajeta, chocolate), libres (salsa, limón, café sin azúcar).

Reglas:
- Cuenta lo VISIBLE, no una receta estándar. Usa el plato, cubiertos o vaso como escala. Usa medios (0.5) si hace falta.
- Lo frito suma grasas_sin_proteina por el aceite. Un guiso se reparte en sus ingredientes.
- Si no es comida: "es_comida": false y "platillos": [].
- "confianza": "alta" solo si distingues bien cada alimento y su tamaño; "baja" si es un guiso mezclado o no puedes juzgar el tamaño.
- "nota": una frase concreta en español sobre lo más incierto (ej. "no se ve cuánto aceite lleva el arroz").

Responde SOLO con JSON, sin texto alrededor, con esta forma:
{"es_comida": true, "platillos": [{"nombre": "Tacos de bistec", "porcion": "3 tacos medianos", "equivalentes": {"cereales_sin_grasa": 3, "aoa_bajo": 3, "grasas_sin_proteina": 1}}], "confianza": "media", "nota": "..."}`;

type Proveedor = { nombre: string; url: string; llave: string; modelo: string };

/** Modelos a probar por proveedor, en orden. Los catálogos cambian seguido: si uno ya no existe (404), sigue el próximo. */
const modelos = (env: string, porDefecto: string[]) => { const v = Deno.env.get(env); return v ? v.split(',').map((x) => x.trim()).filter(Boolean) : porDefecto; };

function proveedores(): Proveedor[] {
  const lista: Proveedor[] = [];
  const cfCuenta = Deno.env.get('CF_ACCOUNT_ID')?.trim(); const cfToken = Deno.env.get('CF_API_TOKEN')?.trim();
  if (cfCuenta && cfToken) for (const modelo of modelos('CF_MODEL', ['@cf/google/gemma-3-12b-it', '@cf/meta/llama-4-scout-17b-16e-instruct'])) {
    lista.push({ nombre: 'cloudflare', url: `https://api.cloudflare.com/client/v4/accounts/${cfCuenta}/ai/v1/chat/completions`, llave: cfToken, modelo });
  }
  const groq = Deno.env.get('GROQ_API_KEY')?.trim();
  if (groq) for (const modelo of modelos('GROQ_MODEL', ['qwen/qwen3.6-27b', 'meta-llama/llama-4-scout-17b-16e-instruct'])) {
    lista.push({ nombre: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', llave: groq, modelo });
  }
  return lista;
}

/** Llamada estilo OpenAI (Cloudflare y Groq la aceptan). Devuelve el texto de la respuesta. */
async function preguntar(p: Proveedor, imagen: string, mime: string): Promise<string> {
  const r = await fetch(p.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${p.llave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: p.modelo, temperature: 0.2, max_tokens: 900,
      messages: [{ role: 'user', content: [{ type: 'text', text: INSTRUCCION }, { type: 'image_url', image_url: { url: `data:${mime};base64,${imagen}` } }] }],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) {
    // El cuerpo de error del proveedor no trae la foto: se registra un pedazo para saber la causa (llave, modelo, permisos).
    const detalle = (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 220);
    throw new Error(`${p.nombre} ${p.modelo} ${r.status} ${detalle}`);
  }
  const j = await r.json();
  const texto = j?.choices?.[0]?.message?.content;
  if (typeof texto !== 'string' || !texto.trim()) throw new Error(`${p.nombre} sin respuesta`);
  return texto;
}

/** Saca el primer objeto JSON del texto y lo deja en la forma que espera la app (sin confiar en el modelo). */
function normalizar(texto: string) {
  const inicio = texto.indexOf('{'); const fin = texto.lastIndexOf('}');
  if (inicio < 0 || fin <= inicio) throw new Error('respuesta sin JSON');
  const crudo = JSON.parse(texto.slice(inicio, fin + 1));
  const platillos = Array.isArray(crudo?.platillos) ? crudo.platillos.slice(0, 12).map((x: Record<string, unknown>) => {
    const eq: Record<string, number> = {};
    for (const [g, v] of Object.entries((x?.equivalentes ?? {}) as Record<string, unknown>)) {
      const n = Number(v);
      if (GRUPOS.includes(g) && Number.isFinite(n) && n > 0) eq[g] = Math.min(20, Math.round(n * 2) / 2);
    }
    return { nombre: String(x?.nombre ?? 'Platillo').slice(0, 80), porcion: String(x?.porcion ?? '').slice(0, 80), equivalentes: eq };
  }).filter((x: { equivalentes: Record<string, number> }) => Object.keys(x.equivalentes).length > 0) : [];
  const confianza = ['alta', 'media', 'baja'].includes(crudo?.confianza) ? crudo.confianza : 'media';
  return { es_comida: crudo?.es_comida !== false && platillos.length > 0, platillos, confianza, nota: String(crudo?.nota ?? '').slice(0, 200) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ error: 'METHOD' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return responder({ error: 'UNAUTHENTICATED' }, 401);
  const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: auth } }, db: { schema: 'athlete3' }, auth: { persistSession: false },
  });
  const { data: usuario } = await sb.auth.getUser(auth.slice(7));
  if (!usuario?.user) return responder({ error: 'UNAUTHENTICATED' }, 401);

  let cuerpo: { imagen?: string; mime?: string };
  try { cuerpo = await req.json(); } catch { return responder({ error: 'VALIDATION_FAILED' }, 400); }
  const imagen = typeof cuerpo.imagen === 'string' ? cuerpo.imagen : '';
  const mime = cuerpo.mime === 'image/png' ? 'image/png' : 'image/jpeg';
  if (!imagen || imagen.length > MAX_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(imagen.slice(0, 200))) return responder({ error: 'VALIDATION_FAILED' }, 400);

  const cuota = await sb.rpc('consume_food_photo_quota', { p_max: LIMITE });
  if (cuota.error) {
    if (cuota.error.message.includes('RATE_LIMITED')) return responder({ error: 'RATE_LIMITED' }, 429);
    // Sin la función de cuota (falta la migración 20261110000300) o la base no responde.
    console.warn('analizar-comida: cuota no disponible', cuota.error.code ?? '', cuota.error.message.slice(0, 120));
    return responder({ error: 'NOT_READY' }, 503);
  }

  const lista = proveedores();
  if (!lista.length) return responder({ error: 'NOT_CONFIGURED' }, 503);
  for (const p of lista) {
    try {
      const resultado = normalizar(await preguntar(p, imagen, mime));
      return responder({ ...resultado, modelo: `${p.nombre}:${p.modelo}` });
    } catch (e) {
      // Sin la foto ni la respuesta en el log: solo qué proveedor falló.
      console.warn('analizar-comida: falló', e instanceof Error ? e.message.slice(0, 300) : p.nombre);
    }
  }
  return responder({ error: 'PROVIDER_FAILED' }, 502);
});
