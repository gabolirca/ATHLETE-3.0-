# Android Auto Backup y bases cifradas

**Fecha:** 5-nov-2026 · **Revisó:** backend (Claude Code) · **Afecta a:** `apps/mobile/app.json` (equipo móvil) y `@athlete/data`

## 1. Configuración actual (integración `6fa0c61`)

Se revisó leyendo el código de los paquetes instalados (Expo SDK 58), sin compilar ni ejecutar en un dispositivo.

| Elemento | Valor efectivo | Fuente |
|---|---|---|
| `android.allowBackup` | No declarado → **`true`** | `@expo/config-plugins/build/android/AllowBackup.js`: `config.android?.allowBackup ?? true` |
| Reglas de respaldo | Las pone el plugin `expo-secure-store` (`configureAndroidBackup`, por defecto `true`): `android:fullBackupContent="@xml/secure_store_backup_rules"` y `android:dataExtractionRules="@xml/secure_store_data_extraction_rules"` | `expo-secure-store/plugin/build/withSecureStore.js` |
| Contenido de las reglas | `<include domain="sharedpref" path="."/>` + `<exclude domain="sharedpref" path="SecureStore"/>`, tanto en `cloud-backup` como en `device-transfer` | `expo-secure-store/android/src/main/res/xml/*.xml` |
| Directorio de bases | `files/SQLite/` (dominio `file`) | `expo-sqlite/android/.../SQLiteModule.kt`: `filesDir/SQLite` |

En las reglas de Android, si hay algún `<include>`, **solo** se respalda lo incluido. Con las reglas actuales solo
se respaldan las preferencias compartidas que no son `SecureStore`.

## 2. Qué se incluye y qué se excluye hoy

| Ruta en el dispositivo | Contenido | Respaldo en la nube | Transferencia entre dispositivos |
|---|---|---|---|
| `files/SQLite/athlete3.db` (+`-wal`, `-shm`) | Base legacy cifrada | Excluida (no está incluida) | Excluida |
| `files/SQLite/athlete3-<uuid>.db` (+`-wal`, `-shm`) | Base oficial cifrada | Excluida | Excluida |
| `files/athlete3-backups/**` | Copias de la migración (cifradas) | Excluida | Excluida |
| `shared_prefs/SecureStore.xml` | Claves de las bases, identidad y marcador del almacén activo (cifrados con una clave del Keystore) | **Excluida explícitamente** | **Excluida explícitamente** |
| Otras `shared_prefs` | Preferencias de librerías; ningún dato de ATHLETE | Incluida | Incluida |
| Android Keystore | Clave maestra de SecureStore | La plataforma nunca la respalda | Nunca |

**Conclusión:** hoy ya no se respalda ninguna base cifrada sin su clave, ni ninguna clave. Pero es un efecto
**implícito** de las reglas de `expo-secure-store`. Si otro plugin o una edición manual añade sus propias reglas, el
plugin de SecureStore emite un aviso y **no aplica las suyas**. Con `allowBackup=true`, Android pasaría entonces a
respaldar todo: las bases cifradas y un `SecureStore.xml` que el Keystore del dispositivo nuevo no puede descifrar.
Al restaurar habría archivos sin claves.

## 3. Estrategia adoptada

1. **Ninguna base cifrada se respalda con el mecanismo del sistema.** La recuperación entre dispositivos se hace con
   la cuenta y la sync (Supabase), que no depende de mover claves.
2. **Cambio solicitado al equipo móvil en `apps/mobile/app.json`:** `"android": { "package": "com.athlete.mobile",
   "allowBackup": false }`. Además:
   - mantener el plugin `expo-secure-store` con `configureAndroidBackup` por defecto, porque sus
     `dataExtractionRules` siguen excluyendo las bases y SecureStore en la transferencia entre dispositivos;
   - no añadir otras reglas de respaldo.

   Según la documentación de Android, en apps que apuntan a Android 12 o superior, `allowBackup=false` desactiva el
   respaldo en la nube pero no la transferencia entre dispositivos. Por eso se mantienen las reglas. **Pendiente de
   verificar** en una compilación (`expo prebuild` en un directorio desechable) y en un emulador.
3. **Comprobación propuesta para CI (equipo móvil):** después de `expo prebuild`, verificar que `AndroidManifest.xml`
   contiene:
   - `android:allowBackup="false"`;
   - `android:dataExtractionRules="@xml/secure_store_data_extraction_rules"`;
   - `android:fullBackupContent="@xml/secure_store_backup_rules"`.
4. **Defensa en el código** (ya implementada y probada): aunque las reglas fallen, el selector nunca trata los
   archivos restaurados como una instalación nueva. Prueba: `active-store.test.ts`, “restauración de archivos sin el
   almacén seguro”.

## 4. Exclusiones explícitas de esta fase

- **No** se implementa exportación, custodia en servidor ni derivación de claves. Cualquier propuesta en esa línea
  (por ejemplo, una clave envuelta con una contraseña o guardada en el servidor) requiere revisión de seguridad antes
  de escribir código.
- **iOS** queda fuera del alcance pedido, pero se anota el riesgo equivalente:
  - `Documents/SQLite` entra en los respaldos de iCloud o del equipo;
  - los elementos del llavero de `expo-secure-store` con la accesibilidad por defecto (sin `ThisDeviceOnly`) solo
    viajan en respaldos cifrados;
  - el llavero sobrevive a la desinstalación.

  El selector cubre los tres casos (§5 de `seleccion-almacen.md`). Falta decidir si los archivos se marcan con
  `isExcludedFromBackup`.
