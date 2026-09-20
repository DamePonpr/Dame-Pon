# Android APK de prueba por GitHub Actions

El workflow `.github/workflows/android-apk.yml` genera un APK firmado con el
keystore de prueba `android-signing/dame-pon-preview.keystore`.

- Se ejecuta manualmente desde GitHub Actions o con cada push a `main`.
- El APK se conserva como artefacto del run y como asset de un GitHub Release
  con tag `preview-<número-de-run>`.
- El keystore es exclusivamente para builds de prueba. No se debe reutilizar
  para una versión de producción.
- El primer APK generado por GitHub Actions debe instalarse después de
  desinstalar el APK firmado por EAS, porque las firmas son distintas.
- Después de esa primera instalación, los siguientes APK generados por GitHub
  Actions pueden instalarse uno encima del otro.

El workflow no utiliza EAS Build. `expo prebuild` genera `android/` en cada
run y esa carpeta está ignorada por Git.