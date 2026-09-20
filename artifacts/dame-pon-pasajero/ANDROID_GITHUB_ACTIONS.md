# Android APK de prueba por GitHub Actions

El workflow `.github/workflows/android-apk.yml` genera un APK de preview firmado
intencionalmente con `android/app/debug.keystore`, mediante
`signingConfigs.debug`. El certificado SHA-256 esperado es:

`fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`

- Se ejecuta manualmente desde GitHub Actions o con cada push a `main`.
- El APK se conserva como artefacto del run y como asset de un GitHub Release
  con tag `preview-<número-de-run>`.
- El pasajero usa el applicationId histórico `com.damepon.damepon`, para que
  pueda actualizar las instalaciones y previews anteriores con ese package.
- Los previews sucesivos pueden instalarse uno encima del otro porque conservan
  ese package y el certificado Android Debug.
- Antes de publicar en Play Store hay que cambiar explícitamente la firma a
  `android-signing/dame-pon-preview.keystore` o a EAS/Play App Signing. Ese
  cambio de certificado requerirá desinstalar la instalación de preview.

El workflow no utiliza EAS Build. `expo prebuild` genera `android/` en cada
run y esa carpeta está ignorada por Git. El workflow valida después de cada
compilación el package, `versionCode`, `versionName` y el certificado.