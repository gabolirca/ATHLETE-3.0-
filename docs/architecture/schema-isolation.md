# Aislamiento de Supabase — ATHLETE 3.0

**Estado:** Propuesta técnica pendiente de verificación y aprobación  
**Responsable:** Claude

## 1. Objetivo

Garantizar que ATHLETE 3.0 funcione de manera independiente de Diario Gym v2 y EasyTeacher.

## 2. Esquemas

Se propone:

- `athlete3`: tablas, vistas y funciones que consume la aplicación.
- `athlete3_private`: funciones internas, helpers y mecanismos de seguridad.

No se deben crear objetos nuevos en `public` salvo justificación y aprobación explícita.

## 3. Identidad del proyecto

Antes de conectar el repositorio:

1. Confirmar organización Supabase.
2. Confirmar referencia exacta del proyecto.
3. Confirmar estado del proyecto.
4. Confirmar acceso de lectura.
5. Confirmar que corresponde al entorno de ATHLETE 3.0.
6. Documentar la decisión.

La referencia detectada en la auditoría anterior fue `npdrjhbkilicuieecbgd`. Debe verificarse nuevamente.

## 4. Permisos

- No conceder acceso a `anon` a datos personales.
- Conceder permisos mínimos a `authenticated`.
- Habilitar RLS en tablas personales.
- Definir políticas por operación.
- Utilizar `auth.uid()` para verificar propiedad.
- Revisar privilegios por omisión.
- Evitar que funciones privilegiadas tengan un `search_path` inseguro.

## 5. API

El esquema `athlete3` debe exponerse explícitamente en la configuración de Data API cuando se utilice desde Supabase.

El cliente móvil debe seleccionar el esquema correspondiente.

La exposición del esquema no sustituye los permisos ni RLS.

## 6. Autenticación

No se deben crear triggers que interfieran con los flujos de autenticación del sistema legado.

Se evaluará una función idempotente de inicialización de perfil para ATHLETE 3.0.

## 7. Elementos globales del proyecto

Se deben inventariar:

- Historial de migraciones.
- Edge Functions.
- Secretos.
- Storage.
- Realtime.
- Extensiones.
- Triggers.
- Funciones.
- Roles.
- Configuración de Data API.

Los nombres globales deberán utilizar prefijos propios de ATHLETE 3.0.

## 8. Historial de migraciones

Supabase mantiene historial de migraciones por proyecto.

La separación de esquemas no crea un historial independiente.

Antes de aplicar migraciones nuevas:

1. Obtener el historial remoto.
2. Compararlo con los archivos locales.
3. Clasificar discrepancias.
4. Revisar dependencias.
5. Preparar un plan de despliegue.
6. Solicitar aprobación explícita.

No ejecutar `db push`, `migration repair` ni `db reset` en el proyecto compartido durante la auditoría.

## 9. Pruebas de seguridad

Se deben probar:

- Usuario A no puede leer datos de B.
- Usuario A no puede modificar datos de B.
- Usuario anónimo no puede acceder a datos privados.
- Las claves privilegiadas no aparecen en el cliente.
- Los objetos personales tienen RLS.
- Las funciones internas no permiten escalamiento de privilegios.

## 10. Restricciones

No modificar objetos legados.

No restaurar Diario Gym v2 dentro del proyecto de ATHLETE 3.0 sin un plan aprobado.

No ejecutar operaciones destructivas.

## 11. Criterio de aceptación

El aislamiento se considera validado cuando el inventario, los permisos, las políticas RLS y las pruebas de seguridad estén documentados y aprobados.