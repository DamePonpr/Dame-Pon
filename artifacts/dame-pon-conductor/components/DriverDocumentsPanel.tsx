import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@workspace/dame-pon-shared/components/AppButton';
import { useColors } from '@workspace/dame-pon-shared/hooks/useColors';
import { REQUIRED_DRIVER_DOCUMENTS, latestDocument, type DriverDocumentKind } from '../lib/driverDocuments';
import { useDriverDocuments } from '../hooks/useDriverDocuments';

function statusLabel(status: string | undefined) {
  if (status === 'approved') return 'Aprobado';
  if (status === 'submitted') return 'En revisión';
  if (status === 'rejected') return 'Requiere corrección';
  if (status === 'expired') return 'Vencido';
  return 'Pendiente';
}

export function DriverDocumentsPanel({ userId }: { userId: string }) {
  const colors = useColors();
  const documents = useDriverDocuments(userId);
  const [selected, setSelected] = useState<DriverDocumentKind | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  const openPicker = (kind: DriverDocumentKind) => {
    setSelected(kind);
    setPickerVisible(true);
  };

  const chooseSource = async (source: 'camera' | 'library') => {
    if (!selected) return;
    setPickerVisible(false);
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return;
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.82, allowsEditing: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.82, allowsEditing: true });
    if (result.canceled || !result.assets[0]?.uri) return;
    await documents.upload(selected, result.assets[0].uri, result.assets[0].mimeType ?? 'image/jpeg');
    setSelected(null);
  };

  const approvalStatus = documents.review?.approvalStatus ?? 'pending_documents';
  const isSuspended = approvalStatus === 'suspended' || approvalStatus === 'offboarded';

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: isSuspended ? colors.destructive : colors.border }]}>
      <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>VERIFICACIÓN DEL CONDUCTOR</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>
        {isSuspended ? 'Cuenta suspendida' : documents.isFullyApproved ? 'Documentos aprobados' : 'Completa tu revisión'}
      </Text>
      <Text style={[styles.copy, { color: colors.mutedForeground }]}>
        {isSuspended
          ? (documents.review?.driverReviewNotes ?? 'Tu cuenta no puede recibir viajes mientras esté suspendida.')
          : documents.isFullyApproved
            ? 'Ya puedes activar tu disponibilidad y recibir solicitudes.'
            : 'Sube los cinco documentos. El equipo los revisará y te avisará cuando puedas conectarte.'}
      </Text>
      {documents.error ? <Text style={[styles.error, { color: colors.destructive }]}>{documents.error}</Text> : null}
      {!documents.loading && !isSuspended ? REQUIRED_DRIVER_DOCUMENTS.map(({ kind, label, table }) => {
        const source = table === 'driver' ? documents.review?.driverDocuments ?? [] : documents.review?.vehicleDocuments ?? [];
        const docType = kind === 'profile_photo' ? 'photo' : kind === 'license_front' ? 'license_front' : kind === 'vehicle_photo' ? 'photo' : kind;
        const document = latestDocument(source, docType);
        return (
          <View key={kind} style={[styles.row, { borderTopColor: colors.border }]}>
            <View style={styles.rowCopy}>
              <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
              <Text style={[styles.status, { color: document?.status === 'approved' ? colors.primary : colors.mutedForeground }]}>
                {statusLabel(document?.status)}
              </Text>
              {document?.review_notes ? <Text style={[styles.note, { color: colors.destructive }]}>{document.review_notes}</Text> : null}
            </View>
            {document?.status !== 'approved' ? <AppButton
              label={document ? 'Reemplazar' : 'Subir'}
              variant="secondary"
              onPress={() => openPicker(kind)}
              disabled={table === 'vehicle' && !documents.review?.vehicleId}
              loading={documents.uploading}
              style={styles.action}
            /> : null}
          </View>
        );
      }) : null}
      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.modal, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Selecciona una fuente</Text>
            <AppButton label="Tomar foto" onPress={() => void chooseSource('camera')} />
            <AppButton label="Elegir de la galería" variant="secondary" onPress={() => void chooseSource('library')} />
            <Pressable onPress={() => setPickerVisible(false)} style={styles.cancel}>
              <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 8 },
  eyebrow: { fontFamily: 'Jakarta-SemiBold', fontSize: 10, letterSpacing: 1.1 },
  title: { fontFamily: 'Jakarta-Bold', fontSize: 19 },
  copy: { fontFamily: 'Jakarta', fontSize: 12, lineHeight: 18 },
  error: { fontFamily: 'Jakarta-Medium', fontSize: 12, lineHeight: 17 },
  row: { borderTopWidth: 1, paddingTop: 10, marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowCopy: { flex: 1 },
  label: { fontFamily: 'Jakarta-SemiBold', fontSize: 13 },
  status: { fontFamily: 'Jakarta', fontSize: 11, marginTop: 2 },
  note: { fontFamily: 'Jakarta', fontSize: 11, lineHeight: 16, marginTop: 3 },
  action: { minHeight: 40, paddingHorizontal: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 22 },
  modal: { borderRadius: 22, padding: 18, gap: 10 },
  modalTitle: { fontFamily: 'Jakarta-Bold', fontSize: 18, marginBottom: 4 },
  cancel: { alignItems: 'center', paddingVertical: 8 },
  cancelText: { fontFamily: 'Jakarta-SemiBold', fontSize: 13 },
});