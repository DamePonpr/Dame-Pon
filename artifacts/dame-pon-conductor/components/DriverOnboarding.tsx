import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@workspace/dame-pon-shared/components/AppButton';
import { BrandLogo } from '@workspace/dame-pon-shared/components/BrandLogo';
import { useAuth } from '@workspace/dame-pon-shared/context/AuthContext';
import { useColors } from '@workspace/dame-pon-shared/hooks/useColors';
import { supabase } from '@workspace/dame-pon-shared/lib/supabase';
import {
  DRIVER_AGREEMENTS,
  ensureDriverActivationCode,
  getDriverOnboardingState,
  getDriverVehicle,
  isDriverDocumentsComplete,
  saveDriverOnboardingStep,
  saveDriverVehicle,
  acceptDriverAgreement,
  activateDriverWithCode,
  uploadDriverOnboardingDocument,
  type DriverOnboardingState,
  type DriverVehicleDraft,
} from '@workspace/dame-pon-shared/lib/onboarding';

const vehicleDocuments = [
  ['registration', 'Registro del vehículo'],
  ['insurance', 'Seguro'],
  ['vehicle_front', 'Foto frontal'],
  ['vehicle_rear', 'Foto trasera'],
  ['vehicle_left', 'Foto lateral izquierda'],
  ['vehicle_right', 'Foto lateral derecha'],
  ['vehicle_interior', 'Foto del interior'],
  ['vin', 'Foto del VIN'],
  ['door_label', 'Etiqueta de la puerta'],
  ['inspection', 'Inspección'],
] as const;

function hasDocument(state: DriverOnboardingState | null, docType: string) {
  return Boolean(state?.driverDocuments.some((doc) => doc.doc_type === docType && doc.status !== 'rejected')
    || state?.vehicleDocuments.some((doc) => doc.doc_type === docType && doc.status !== 'rejected'));
}

function PermissionHint({ kind }: { kind: 'camera' | 'photos' }) {
  const colors = useColors();
  return (
    <View style={[styles.permissionHint, { backgroundColor: colors.secondary }]}>
      <Text style={[styles.permissionText, { color: colors.mutedForeground }]}>
        Necesitamos permiso para {kind === 'camera' ? 'usar la cámara' : 'elegir una imagen'}. Si lo rechazaste permanentemente, ábrelo desde Ajustes.
      </Text>
      <Pressable onPress={() => void Linking.openSettings()}>
        <Text style={[styles.permissionLink, { color: colors.primary }]}>Abrir Ajustes</Text>
      </Pressable>
    </View>
  );
}

function CameraCapture({
  facing,
  onCaptured,
  onClose,
}: {
  facing: CameraType;
  onCaptured: (uri: string) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [camera, setCamera] = useState<CameraView | null>(null);

  if (!permission) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  if (!permission.granted) {
    return (
      <View style={[styles.cameraPermission, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Permiso de cámara</Text>
        <Text style={[styles.copy, { color: colors.mutedForeground }]}>Usaremos la cámara {facing === 'front' ? 'frontal' : 'trasera'} para este paso.</Text>
        <AppButton label="Permitir cámara" onPress={() => void requestPermission()} />
        {!permission.canAskAgain ? <PermissionHint kind="camera" /> : null}
        <AppButton label="Cancelar" variant="secondary" onPress={onClose} />
      </View>
    );
  }

  return (
    <View style={styles.cameraScreen}>
      <CameraView ref={setCamera} facing={facing} style={StyleSheet.absoluteFill} />
      <View style={styles.cameraOverlay}>
        <View style={[styles.cameraFrame, { borderColor: colors.primaryForeground }]} />
        <Text style={styles.cameraInstruction}>Alinea el documento dentro del marco</Text>
        <View style={styles.cameraActions}>
          <AppButton label="Cancelar" variant="secondary" onPress={onClose} style={styles.cameraButton} />
          <AppButton
            label="Tomar foto"
            onPress={() => {
              void camera?.takePictureAsync({ quality: 0.78, skipProcessing: true }).then((photo) => {
                if (photo?.uri) onCaptured(photo.uri);
              });
            }}
            style={styles.cameraButton}
          />
        </View>
      </View>
    </View>
  );
}

export function DriverOnboarding() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const [state, setState] = useState<DriverOnboardingState | null>(null);
  const [vehicle, setVehicle] = useState<DriverVehicleDraft>({
    make: '', model: '', year: '', color: '', plate: '', vin: '', seats: '4',
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [camera, setCamera] = useState<{ docType: string; table: 'driver' | 'vehicle'; facing: CameraType } | null>(null);
  const [agreementKey, setAgreementKey] = useState<string | null>(null);
  const [activationCode, setActivationCode] = useState('');

  async function refresh() {
    if (!user) return;
    const result = await getDriverOnboardingState(user.id);
    if (result.error) setError(result.error);
    else {
      setState(result.data);
      if (result.data?.activationCode && !activationCode) setActivationCode(result.data.activationCode);
    }
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
    if (!user) return;
    const channel = supabase
      .channel(`driver-onboarding-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers', filter: `id=eq.${user.id}` }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_activation_codes', filter: `driver_id=eq.${user.id}` }, () => void refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user || !state?.vehicleId) return;
    void getDriverVehicle(user.id).then((result) => {
      if (result.data) setVehicle(result.data);
    });
  }, [state?.vehicleId, user?.id]);

  const completeVehicleDocuments = useMemo(
    () => Boolean(state?.vehicleId && vehicleDocuments.every(([type]) => hasDocument(state, type))),
    [state],
  );

  if (!user || !profile) return <Redirect href="/(auth)/sign-in" />;
  if (profile.onboarding_completed) return <Redirect href="/(root)/(tabs)/home" />;
  if (loading || !state) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><Text style={[styles.copy, { color: colors.mutedForeground }]}>Cargando tu registro…</Text></View>;
  }
  if (state.approvalStatus === 'approved' && state.onboardingStep >= 6 && !state.activatedAt) {
    return (
      <ActivationScreen
        code={activationCode}
        setCode={setActivationCode}
        expiresAt={state.activationExpiresAt}
        error={error}
        busy={busy}
        onGenerate={async () => {
          setBusy(true);
          const result = await ensureDriverActivationCode();
          if (result.error) setError(result.error);
          else if (result.code) setActivationCode(result.code);
          await refresh();
          setBusy(false);
        }}
        onActivate={async () => {
          setBusy(true);
          setError('');
          const result = await activateDriverWithCode(activationCode);
          if (result.error) setError(result.error);
          else {
            router.replace('/(root)/(tabs)/home');
            return;
          }
          setBusy(false);
        }}
      />
    );
  }
  if (state.onboardingStep >= 6) {
    return <ReviewScreen state={state} error={error} onRefresh={() => void refresh()} />;
  }

  const driverId = user.id;
  const currentState = state;
  const step = state.onboardingStep + 1;
  async function upload(docType: string, table: 'driver' | 'vehicle', uri: string, mimeType = 'image/jpeg') {
    setBusy(true);
    setError('');
    const result = await uploadDriverOnboardingDocument(driverId, table, docType, uri, mimeType, currentState.vehicleId);
    if (result.error) setError(result.error);
    await refresh();
    setBusy(false);
  }
  async function next(completedStep: number) {
    setBusy(true);
    const result = await saveDriverOnboardingStep(driverId, completedStep);
    if (result.error) setError(result.error);
    await refresh();
    setBusy(false);
  }
  async function pickDocument(docType: string, table: 'driver' | 'vehicle') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso necesario', 'Permite el acceso a tus fotos o abre Ajustes para continuar.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Abrir Ajustes', onPress: () => void Linking.openSettings() },
      ]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.78,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      await upload(docType, table, result.assets[0].uri, result.assets[0].mimeType ?? 'image/jpeg');
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
        <View style={styles.header}>
          <BrandLogo role="conductor" style={styles.logo} />
          <Text style={[styles.eyebrow, { color: colors.primary }]}>REGISTRO DE CONDUCTOR</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Completa tu registro</Text>
          <Text style={[styles.copy, { color: colors.mutedForeground }]}>Paso {step} de 6 · Puedes cerrar y continuar después.</Text>
        </View>
        <StepBar step={step} />

        {step === 1 ? (
          <OnboardingCard title="Foto de perfil" copy="Toma una foto clara de tu rostro. Usaremos la cámara frontal y una guía ovalada.">
            <View style={[styles.ovalGuide, { borderColor: colors.primary }]} />
            <AppButton label={hasDocument(state, 'photo') ? 'Reemplazar foto' : 'Tomar foto frontal'} onPress={() => setCamera({ docType: 'photo', table: 'driver', facing: 'front' })} loading={busy} />
            {hasDocument(state, 'photo') ? <StatusText label="Foto enviada para revisión" /> : null}
            <AppButton label="Continuar" onPress={() => void next(1)} disabled={!hasDocument(state, 'photo')} loading={busy} variant="secondary" />
          </OnboardingCard>
        ) : null}

        {step === 2 ? (
          <OnboardingCard title="Licencia de conducir de Puerto Rico" copy="Fotografía el frente completo de tu licencia. La cámara trasera ayuda a mantener el documento enfocado.">
            <View style={[styles.documentGuide, { borderColor: colors.primary }]} />
            <AppButton label={hasDocument(state, 'license_front') ? 'Reemplazar licencia' : 'Tomar foto de licencia'} onPress={() => setCamera({ docType: 'license_front', table: 'driver', facing: 'back' })} loading={busy} />
            {hasDocument(state, 'license_front') ? <StatusText label="Licencia enviada para revisión" /> : null}
            <AppButton label="Enviar y continuar" onPress={() => void next(2)} disabled={!hasDocument(state, 'license_front')} loading={busy} variant="secondary" />
          </OnboardingCard>
        ) : null}

        {step === 3 ? (
          <OnboardingCard title="Certificados NTSP" copy="Sube una imagen o captura legible de cada certificado.">
            {(['ntsp_certificate_1', 'ntsp_certificate_2'] as const).map((type, index) => (
              <DocumentRow key={type} label={`Certificado NTSP ${index + 1}`} uploaded={hasDocument(state, type)} onLibrary={() => void pickDocument(type, 'driver')} onCamera={() => setCamera({ docType: type, table: 'driver', facing: 'back' })} loading={busy} />
            ))}
            <AppButton label="Continuar" onPress={() => void next(3)} disabled={!hasDocument(state, 'ntsp_certificate_1') || !hasDocument(state, 'ntsp_certificate_2')} loading={busy} variant="secondary" />
          </OnboardingCard>
        ) : null}

        {step === 4 ? (
          <OnboardingCard title="Certificados de conducta" copy="Sube los dos certificados de conducta como imágenes legibles.">
            {(['conduct_certificate_1', 'conduct_certificate_2'] as const).map((type, index) => (
              <DocumentRow key={type} label={`Certificado de conducta ${index + 1}`} uploaded={hasDocument(state, type)} onLibrary={() => void pickDocument(type, 'driver')} onCamera={() => setCamera({ docType: type, table: 'driver', facing: 'back' })} loading={busy} />
            ))}
            <View style={[styles.backgroundNote, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.noteTitle, { color: colors.foreground }]}>Verificación de antecedentes</Text>
              <Text style={[styles.noteCopy, { color: colors.mutedForeground }]}>La coordinamos contigo. No solicitamos tu número de Seguro Social ni automatizamos esta verificación.</Text>
            </View>
            <AppButton label="Continuar" onPress={() => void next(4)} disabled={!hasDocument(state, 'conduct_certificate_1') || !hasDocument(state, 'conduct_certificate_2')} loading={busy} variant="secondary" />
          </OnboardingCard>
        ) : null}

        {step === 5 ? (
          <OnboardingCard title="Vehículo y documentos" copy="Completa los datos y sigue la guía de fotos. Las imágenes quedan guardadas por tipo para revisión.">
            <View style={styles.fields}>
              {([
                ['make', 'Marca'],
                ['model', 'Modelo'],
                ['year', 'Año'],
                ['color', 'Color'],
                ['plate', 'Matrícula'],
                ['vin', 'VIN de 17 caracteres'],
                ['seats', 'Cantidad de asientos'],
              ] as const).map(([key, label]) => (
                <TextInput
                  key={key}
                  value={vehicle[key]}
                  onChangeText={(value) => setVehicle({ ...vehicle, [key]: key === 'vin' ? value.toUpperCase().slice(0, 17) : value })}
                  placeholder={label}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType={key === 'year' || key === 'seats' ? 'number-pad' : 'default'}
                  autoCapitalize={key === 'vin' || key === 'plate' ? 'characters' : 'sentences'}
                  maxLength={key === 'vin' ? 17 : undefined}
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                />
              ))}
            </View>
            <AppButton label={state.vehicleId ? 'Actualizar vehículo' : 'Guardar vehículo'} onPress={async () => {
              setBusy(true);
              const result = await saveDriverVehicle(user.id, vehicle);
              if (result.error) setError(result.error);
              await refresh();
              setBusy(false);
            }} loading={busy} />
            {state.vehicleId ? (
              <View style={styles.documentList}>
                {vehicleDocuments.map(([type, label]) => (
                  <DocumentRow key={type} label={label} uploaded={hasDocument(state, type)} onLibrary={() => void pickDocument(type, 'vehicle')} onCamera={() => setCamera({ docType: type, table: 'vehicle', facing: 'back' })} loading={busy} />
                ))}
              </View>
            ) : null}
            <AppButton label="Continuar a los términos" onPress={() => void next(5)} disabled={!completeVehicleDocuments} loading={busy} variant="secondary" />
          </OnboardingCard>
        ) : null}

        {step === 6 ? (
          <OnboardingCard title="Términos de Dame Pon" copy="Abre cada documento, léelo y acepta electrónicamente. Los textos están marcados como borrador pendiente de revisión legal.">
            {DRIVER_AGREEMENTS.map((agreement) => {
              const accepted = state.acceptedAgreementKeys.includes(agreement.key);
              return (
                <Pressable key={agreement.key} onPress={() => setAgreementKey(agreement.key)} style={[styles.agreementRow, { borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: colors.foreground }]}>{agreement.title}</Text>
                    <Text style={[styles.rowStatus, { color: accepted ? colors.primary : colors.mutedForeground }]}>{accepted ? 'Aceptado electrónicamente' : 'Pendiente de lectura'}</Text>
                  </View>
                  <Text style={[styles.openText, { color: colors.primary }]}>Abrir</Text>
                </Pressable>
              );
            })}
            <AppButton label="Enviar registro a revisión" onPress={() => void next(6)} disabled={state.acceptedAgreementKeys.length !== DRIVER_AGREEMENTS.length} loading={busy} />
          </OnboardingCard>
        ) : null}
      </ScrollView>

      <Modal visible={Boolean(camera)} animationType="slide" onRequestClose={() => setCamera(null)}>
        {camera ? (
          <CameraCapture
            facing={camera.facing}
            onClose={() => setCamera(null)}
            onCaptured={(uri) => {
              const selected = camera;
              setCamera(null);
              void upload(selected.docType, selected.table, uri);
            }}
          />
        ) : null}
      </Modal>
      <Modal visible={Boolean(agreementKey)} transparent animationType="fade" onRequestClose={() => setAgreementKey(null)}>
        {agreementKey ? (
          <AgreementModal
            agreement={DRIVER_AGREEMENTS.find((item) => item.key === agreementKey) ?? DRIVER_AGREEMENTS[0]}
            busy={busy}
            onClose={() => setAgreementKey(null)}
            onAccept={async () => {
              setBusy(true);
              const result = await acceptDriverAgreement(user.id, agreementKey);
              if (result.error) setError(result.error);
              setAgreementKey(null);
              await refresh();
              setBusy(false);
            }}
          />
        ) : null}
      </Modal>
    </View>
  );
}

function StepBar({ step }: { step: number }) {
  const colors = useColors();
  return (
    <View style={styles.stepBar}>
      {Array.from({ length: 6 }, (_, index) => (
        <View key={index} style={[styles.stepSegment, { backgroundColor: index + 1 <= step ? colors.primary : colors.border }]} />
      ))}
    </View>
  );
}

function OnboardingCard({ title, copy, children }: { title: string; copy: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.cardCopy, { color: colors.mutedForeground }]}>{copy}</Text>
      {children}
    </View>
  );
}

function StatusText({ label }: { label: string }) {
  const colors = useColors();
  return <Text style={[styles.status, { color: colors.primary }]}>{label}</Text>;
}

function DocumentRow({ label, uploaded, onLibrary, onCamera, loading }: { label: string; uploaded: boolean; onLibrary: () => void; onCamera: () => void; loading: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.documentRow, { borderColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.rowStatus, { color: uploaded ? colors.primary : colors.mutedForeground }]}>{uploaded ? 'Enviado para revisión' : 'Pendiente'}</Text>
      </View>
      {!uploaded ? (
        <View style={styles.rowActions}>
          <AppButton label="Cámara" variant="secondary" onPress={onCamera} loading={loading} style={styles.rowButton} />
          <AppButton label="Galería" variant="secondary" onPress={onLibrary} loading={loading} style={styles.rowButton} />
        </View>
      ) : null}
    </View>
  );
}

function ReviewScreen({ state, error, onRefresh }: { state: DriverOnboardingState; error: string; onRefresh: () => void }) {
  const colors = useColors();
  return (
    <View style={[styles.center, { backgroundColor: colors.background, padding: 24 }]}>
      <BrandLogo role="conductor" style={styles.logo} />
      <Text style={[styles.title, { color: colors.foreground, textAlign: 'center' }]}>Registro en revisión</Text>
      <Text style={[styles.copy, { color: colors.mutedForeground, textAlign: 'center' }]}>Recibimos tus documentos y términos. Te avisaremos cuando el equipo termine la revisión.</Text>
      <Text style={[styles.copy, { color: colors.mutedForeground, textAlign: 'center' }]}>Verificación de antecedentes — La coordinamos contigo.</Text>
      {state.reviewNotes ? <Text style={[styles.error, { color: colors.destructive }]}>{state.reviewNotes}</Text> : null}
      {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
      <AppButton label="Actualizar estado" onPress={onRefresh} variant="secondary" style={{ width: '100%' }} />
    </View>
  );
}

function ActivationScreen({ code, setCode, expiresAt, error, busy, onGenerate, onActivate }: {
  code: string; setCode: (value: string) => void; expiresAt: string | null; error: string; busy: boolean; onGenerate: () => Promise<void>; onActivate: () => Promise<void>;
}) {
  const colors = useColors();
  return (
    <View style={[styles.center, { backgroundColor: colors.background, padding: 24 }]}>
      <BrandLogo role="conductor" style={styles.logo} />
      <Text style={[styles.title, { color: colors.foreground, textAlign: 'center' }]}>Tu registro fue aprobado</Text>
      <Text style={[styles.copy, { color: colors.mutedForeground, textAlign: 'center' }]}>Ingresa tu código de activación para mostrar el mapa y activar Recibir Pon.</Text>
      <TextInput
        value={code}
        onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
        placeholder="000000"
        placeholderTextColor={colors.mutedForeground}
        keyboardType="number-pad"
        maxLength={6}
        style={[styles.activationInput, { color: colors.foreground, borderColor: colors.border }]}
      />
      {expiresAt ? <Text style={[styles.rowStatus, { color: colors.mutedForeground }]}>Vence en siete días · {new Date(expiresAt).toLocaleDateString()}</Text> : null}
      {!code ? <AppButton label="Generar código" onPress={() => void onGenerate()} loading={busy} variant="secondary" style={{ width: '100%' }} /> : null}
      <AppButton label="Activar conductor" onPress={() => void onActivate()} loading={busy} disabled={code.length !== 6} style={{ width: '100%' }} />
      {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

function AgreementModal({ agreement, busy, onClose, onAccept }: { agreement: typeof DRIVER_AGREEMENTS[number]; busy: boolean; onClose: () => void; onAccept: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.modalBackdrop}>
      <View style={[styles.agreementModal, { backgroundColor: colors.card }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>{agreement.title}</Text>
        <ScrollView style={styles.agreementBody}><Text style={[styles.copy, { color: colors.mutedForeground }]}>{agreement.body}</Text></ScrollView>
        <AppButton label="Aceptar electrónicamente" onPress={onAccept} loading={busy} />
        <AppButton label="Cerrar" variant="secondary" onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flexGrow: 1, padding: 20, gap: 14 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', gap: 12 },
  header: { alignItems: 'center', paddingTop: 12 },
  logo: { width: 84, height: 84, marginBottom: 16 },
  eyebrow: { fontFamily: 'Jakarta-SemiBold', fontSize: 10, letterSpacing: 1.2 },
  title: { fontFamily: 'Jakarta-Bold', fontSize: 26, marginTop: 8 },
  copy: { fontFamily: 'Jakarta', fontSize: 13, lineHeight: 20, marginTop: 7 },
  stepBar: { flexDirection: 'row', gap: 5 },
  stepSegment: { borderRadius: 8, flex: 1, height: 5 },
  card: { borderRadius: 20, borderWidth: 1, gap: 10, padding: 16 },
  cardTitle: { fontFamily: 'Jakarta-Bold', fontSize: 19 },
  cardCopy: { fontFamily: 'Jakarta', fontSize: 12, lineHeight: 18 },
  ovalGuide: { alignSelf: 'center', borderRadius: 80, borderWidth: 2, height: 150, marginVertical: 8, width: 108 },
  documentGuide: { alignSelf: 'center', borderRadius: 12, borderWidth: 2, height: 128, marginVertical: 8, width: 210 },
  status: { fontFamily: 'Jakarta-SemiBold', fontSize: 12 },
  backgroundNote: { borderRadius: 14, gap: 4, marginTop: 4, padding: 12 },
  noteTitle: { fontFamily: 'Jakarta-SemiBold', fontSize: 13 },
  noteCopy: { fontFamily: 'Jakarta', fontSize: 11, lineHeight: 17 },
  fields: { gap: 8, marginTop: 4 },
  input: { borderRadius: 12, borderWidth: 1, fontFamily: 'Jakarta', fontSize: 13, minHeight: 46, paddingHorizontal: 12 },
  documentList: { gap: 8, marginTop: 2 },
  documentRow: { alignItems: 'center', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 10 },
  rowTitle: { fontFamily: 'Jakarta-SemiBold', fontSize: 13 },
  rowStatus: { fontFamily: 'Jakarta', fontSize: 11, marginTop: 3 },
  rowActions: { flexDirection: 'row', gap: 5 },
  rowButton: { minHeight: 38, paddingHorizontal: 9 },
  agreementRow: { alignItems: 'center', borderRadius: 13, borderWidth: 1, flexDirection: 'row', padding: 12 },
  openText: { fontFamily: 'Jakarta-SemiBold', fontSize: 12 },
  permissionHint: { borderRadius: 14, padding: 12 },
  permissionText: { fontFamily: 'Jakarta', fontSize: 12, lineHeight: 17 },
  permissionLink: { fontFamily: 'Jakarta-SemiBold', fontSize: 12, marginTop: 6 },
  cameraScreen: { backgroundColor: '#000', flex: 1 },
  cameraOverlay: { alignItems: 'center', flex: 1, justifyContent: 'flex-end', padding: 24 },
  cameraFrame: { borderRadius: 20, borderWidth: 2, height: 240, marginBottom: 'auto', marginTop: 120, width: 310 },
  cameraInstruction: { color: '#fff', fontFamily: 'Jakarta-SemiBold', fontSize: 13, marginBottom: 18 },
  cameraActions: { flexDirection: 'row', gap: 9, width: '100%' },
  cameraButton: { flex: 1 },
  cameraPermission: { flex: 1, gap: 12, justifyContent: 'center', padding: 24 },
  modalBackdrop: { backgroundColor: 'rgba(0,0,0,0.58)', flex: 1, justifyContent: 'center', padding: 20 },
  agreementModal: { borderRadius: 22, gap: 11, maxHeight: '82%', padding: 18 },
  agreementBody: { maxHeight: 360 },
  activationInput: { borderRadius: 14, borderWidth: 1, fontFamily: 'Jakarta-Bold', fontSize: 28, letterSpacing: 7, minHeight: 58, textAlign: 'center', width: '100%' },
  error: { fontFamily: 'Jakarta-Medium', fontSize: 12, lineHeight: 18, textAlign: 'center' },
});