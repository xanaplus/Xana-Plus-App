import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, BottomSheet, Button, Card, Chip, Icon, Screen, SelectableOption, TopBar, Txt } from '@/components/ui';
import { deliverySlots, stores } from '@/data/catalog';
import {
  cancelPrescription, getPrescription, getPrescriptionEvents, orderPrescription, pickPrescriptionPhotos,
  prescriptionError, removePrescriptionPhoto, respondToPrescription, STATUS_LABELS, submitPrescription,
  uploadPrescriptionPhoto, type Prescription, type PrescriptionEvent, type PrescriptionStatus,
} from '@/features/prescriptions/api';
import { ErrorNotice, PhotoQueue, PrivatePhotos } from '@/features/prescriptions/ui';
import { useFulfilment } from '@/store/fulfilment';
import { useOrders } from '@/store/orders';
import { useSession } from '@/store/session';
import { colors, radius, spacing } from '@/theme';

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not specified';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not specified' : date.toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function statusTone(status: PrescriptionStatus): 'neutral' | 'info' | 'fresh' | 'warning' {
  const tones: Record<string, 'neutral' | 'info' | 'fresh' | 'warning'> = {
    draft: 'neutral', submitted: 'info', quoted: 'fresh', rejected: 'warning',
    ordered: 'fresh', cancelled: 'neutral', clarification: 'info', held: 'warning',
  };
  return tones[status] ?? 'neutral';
}

function isValidId(id?: string): id is string {
  return !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function backendMissing(error: unknown) {
  const text = error && typeof error === 'object'
    ? `${'message' in error ? String(error.message) : ''} ${'code' in error ? String(error.code) : ''}`.toLowerCase()
    : '';
  return ['does not exist', 'schema cache', 'could not find function', 'pgrst202', 'pgrst205', '42p01'].some(part => text.includes(part));
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return <View style={styles.detail}>
    <Txt variant="caption" color="onSurfaceVariant">{label}</Txt>
    <Txt variant="bodySm">{value?.trim() || 'Not provided'}</Txt>
  </View>;
}

type PendingAction =
  | { kind: 'place-order' }
  | { kind: 'remove-photo'; path: string }
  | { kind: 'cancel-request' };

export default function PrescriptionDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { isAuthenticated } = useSession();
  const fulfilment = useFulfilment();
  const { retryHistory } = useOrders();
  const [record, setRecord] = useState<Prescription | null>(null);
  const [events, setEvents] = useState<PrescriptionEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [backendConfigMissing, setBackendConfigMissing] = useState(false);
  const [assets, setAssets] = useState<ImagePickerAsset[]>([]);
  const [contact, setContact] = useState(fulfilment.address.phone);
  const [addressLine, setAddressLine] = useState(fulfilment.address.line);
  const [clarification, setClarification] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [clockNow, setClockNow] = useState<number | null>(null);
  const actionInFlight = useRef(false);
  const eventsRequest = useRef(0);
  const prescriptionRequest = useRef(0);
  const detailsInitializedForId = useRef<string | null>(null);

  // Prescription checkout saves through its own RPC, not the cart order writer.
  // Refresh the shared history before the customer opens the existing order screen.
  useEffect(() => {
    if (record?.order_no) retryHistory();
  }, [record?.order_no, retryHistory]);

  const loadEvents = useCallback(async (targetId: string) => {
    const requestNo = ++eventsRequest.current;
    setEventsLoading(true);
    setEventsError('');
    try {
      const result = await getPrescriptionEvents(targetId);
      if (requestNo === eventsRequest.current) setEvents(result);
    } catch {
      if (requestNo === eventsRequest.current) {
        setEvents([]);
        setEventsError('Decision history could not be loaded. Retry to fetch the recorded events.');
      }
    } finally {
      if (requestNo === eventsRequest.current) setEventsLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setRecord(null);
      setLoading(false);
      return;
    }
    if (!isValidId(id)) {
      setRecord(null);
      setError('This prescription link is invalid. Open a request from your prescriptions list.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setRecord(null);
    setError('');
    setBackendConfigMissing(false);
    if (detailsInitializedForId.current !== id) {
      eventsRequest.current += 1;
      setEvents([]);
      setEventsError('');
      setEventsLoading(false);
      setAssets([]);
      setClarification('');
      setPendingAction(null);
    }
    const requestNo = ++prescriptionRequest.current;
    try {
      const result = await getPrescription(id);
      if (requestNo !== prescriptionRequest.current || !isAuthenticated) return;
      setRecord(result);
      if (detailsInitializedForId.current !== id) {
        detailsInitializedForId.current = id;
        setContact(fulfilment.address.phone);
        setAddressLine(fulfilment.address.line);
      }
      void loadEvents(id);
    } catch (cause) {
      if (requestNo !== prescriptionRequest.current || !isAuthenticated) return;
      setRecord(null);
      setError(prescriptionError(cause));
      setBackendConfigMissing(backendMissing(cause));
    } finally {
      if (requestNo === prescriptionRequest.current) setLoading(false);
    }
  }, [id, isAuthenticated, fulfilment.address.phone, fulfilment.address.line, loadEvents]);

  useEffect(() => {
    let active = true;
    const refreshTimer = setTimeout(() => {
      if (active && isAuthenticated) void load();
    }, 0);
    return () => {
      active = false;
      clearTimeout(refreshTimer);
    };
  }, [isAuthenticated, load]);

  useEffect(() => {
    if (isAuthenticated) return;
    eventsRequest.current += 1;
    prescriptionRequest.current += 1;
    detailsInitializedForId.current = null;
    actionInFlight.current = false;
    void Promise.resolve().then(() => {
      setRecord(null);
      setEvents([]);
      setEventsError('');
      setEventsLoading(false);
      setAssets([]);
      setClarification('');
      setContact('');
      setAddressLine('');
      setPendingAction(null);
      setBusy(false);
      setClockNow(null);
      setError('');
      setBackendConfigMissing(false);
      setLoading(false);
    });
  }, [isAuthenticated]);

  const backToList = () => router.replace('/pharmacy/prescriptions');
  const fulfilmentMode = fulfilment.mode;
  const fulfilmentSlotMode = fulfilment.slot.mode;
  const setFulfilmentSlotId = fulfilment.setSlotId;
  useEffect(() => {
    if (fulfilmentSlotMode !== fulfilmentMode) {
      const firstAvailable = deliverySlots.find(slot => slot.mode === fulfilmentMode);
      if (firstAvailable) setFulfilmentSlotId(firstAvailable.id);
    }
  }, [fulfilmentMode, fulfilmentSlotMode, setFulfilmentSlotId]);
  useEffect(() => {
    if (!record?.quoted_at && !record?.valid_until) return;
    const initialTimer = setTimeout(() => setClockNow(Date.now()), 0);
    const interval = setInterval(() => setClockNow(Date.now()), 60_000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [record?.quoted_at, record?.valid_until]);
  const chooseFulfilmentMode = (mode: 'delivery' | 'pickup') => {
    fulfilment.setMode(mode);
    if (fulfilment.slot.mode !== mode) {
      const firstAvailable = deliverySlots.find(slot => slot.mode === mode);
      if (firstAvailable) fulfilment.setSlotId(firstAvailable.id);
    }
  };
  const changePhotos = async (camera: boolean) => {
    setError('');
    try {
      const picked = await pickPrescriptionPhotos(camera);
      const accepted = picked.filter(asset => {
        const mime = asset.mimeType || 'image/jpeg';
        const size = asset.fileSize ?? 0;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime) || size > 10 * 1024 * 1024) {
          setError('Photos must be JPEG, PNG or WebP files no larger than 10 MB each.');
          return false;
        }
        return true;
      });
      setAssets(current => [...current, ...accepted.filter(a => !current.some(item => item.uri === a.uri))].slice(0, Math.max(0, 5 - (record?.files?.length ?? 0))));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : prescriptionError(cause));
    }
  };

  const submitDraft = async () => {
    if (!record || busy) return;
    setBusy(true);
    setError('');
    try {
      for (const asset of [...assets]) {
        await uploadPrescriptionPhoto(record.id, asset);
        setAssets(current => current.filter(item => item.uri !== asset.uri));
      }
      await submitPrescription(record.id);
      await load();
    } catch (cause) {
      const message = prescriptionError(cause);
      const configurationMissing = backendMissing(cause);
      await load();
      setError(message);
      setBackendConfigMissing(configurationMissing);
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = (path: string) => {
    if (!record || busy) return;
    setError('');
    setPendingAction({ kind: 'remove-photo', path });
  };

  const sendClarification = async () => {
    if (!record || !clarification.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await respondToPrescription(record.id, clarification.trim());
      setClarification('');
      await load();
    } catch (cause) {
      setError(prescriptionError(cause));
      setBackendConfigMissing(backendMissing(cause));
    } finally {
      setBusy(false);
    }
  };

  const placeOrder = () => {
    if (!record || busy || actionInFlight.current || !contact.trim()) return;
    if (fulfilment.mode === 'delivery' && !addressLine.trim()) {
      setError('Enter a delivery address or choose pickup in your fulfilment settings.');
      return;
    }
    setError('');
    setPendingAction({ kind: 'place-order' });
  };

  const cancelRequest = () => {
    if (!record || busy) return;
    setError('');
    setPendingAction({ kind: 'cancel-request' });
  };

  const confirmPendingAction = async () => {
    const action = pendingAction;
    if (!record || !action || busy || actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true);
    setError('');
    try {
      if (action.kind === 'place-order') {
        await orderPrescription(record.id, {
          paymentMethod: fulfilment.paymentMethod === 'cod' ? 'cod' : 'mpesa',
          contact: contact.trim(),
          addressLine: fulfilment.mode === 'pickup' ? `${fulfilment.store.name} · ${fulfilment.store.address}` : addressLine.trim(),
          slotLabel: fulfilment.mode === 'pickup' ? `Pickup · ${fulfilment.store.name}` : fulfilment.slot.label,
          storeName: fulfilment.store.name,
          quoteVersion: record.quoted_at ?? '',
        });
      } else if (action.kind === 'remove-photo') {
        await removePrescriptionPhoto(record.id, action.path);
      } else {
        await cancelPrescription(record.id);
        setAssets([]);
        setClarification('');
      }
      setPendingAction(null);
      await load();
    } catch (cause) {
      const message = prescriptionError(cause);
      const configurationMissing = backendMissing(cause);
      await load();
      setError(message);
      setBackendConfigMissing(configurationMissing);
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  };

  const validUntil = record?.valid_until
    ? new Date(record.valid_until.length === 10 ? `${record.valid_until}T23:59:59` : record.valid_until)
    : null;
  const quoteExpired = clockNow !== null && ((!!validUntil && validUntil.getTime() < clockNow) ||
    (!!record?.quoted_at && new Date(record.quoted_at).getTime() < clockNow - 48 * 60 * 60 * 1000));
  const isDraft = record?.status === 'draft';
  const isClarification = record?.status === 'clarification';
  const isQuoted = record?.status === 'quoted';
  const canCancel = !!record && ['draft', 'submitted', 'clarification', 'held', 'quoted', 'rejected'].includes(record.status);

  return <Screen padded contentStyle={styles.content}>
    <TopBar title="Prescription details" subtitle="Private request" onBack={backToList} />
    {!isAuthenticated ? <Card variant="elevated" padding={spacing.lg} style={styles.stateCard}>
      <Icon name="lock" size={22} color="primaryContainer" />
      <Txt variant="title">Sign in to view this request</Txt>
      <Txt variant="bodySm" color="onSurfaceVariant">Prescription details and photos are private to your account.</Txt>
      <Button label="Sign in" onPress={() => router.push('/login')} />
      <Button label="Back to prescriptions" variant="outline" onPress={backToList} />
    </Card> : !isValidId(id) ? <Card variant="elevated" padding={spacing.lg} style={styles.stateCard}>
      <Txt variant="title">Invalid prescription link</Txt>
      <Txt variant="bodySm" color="onSurfaceVariant">The request ID in this link is not valid.</Txt>
      <Button label="Back to prescriptions" onPress={backToList} />
    </Card> : loading && !record ? <Card variant="flat" padding={spacing.lg} style={styles.loadingCard}>
      <View style={styles.skeletonWide} /><View style={styles.skeletonShort} /><View style={styles.skeletonBlock} />
      <ActivityIndicator accessibilityLabel="Loading prescription details" color={colors.primary} />
    </Card> : error && !record ? <View style={styles.stateCard}>
      {backendConfigMissing ? <Card variant="tinted" padding={spacing.lg} style={styles.configNotice}>
        <Icon name="info" size={18} color="primaryContainer" />
        <View style={styles.flex}>
          <Txt variant="label">Prescription service unavailable</Txt>
          <Txt variant="bodySm" color="onSurfaceVariant">The prescription service is unavailable in this environment. No request has been changed.</Txt>
        </View>
      </Card> : null}
      <ErrorNotice message={error} onRetry={() => void load()} />
      <Button label="Back to prescriptions" variant="outline" onPress={backToList} />
    </View> : record ? <>
      <Card variant="elevated" padding={spacing.lg} style={styles.summary}>
        <View style={styles.summaryHead}>
          <View style={styles.flex}>
            <Txt variant="caption" color="onSurfaceVariant">REQUEST FOR</Txt>
            <Txt variant="titleLg">{record.patient_name || 'Patient name not provided'}</Txt>
          </View>
          <Badge label={STATUS_LABELS[record.status]} tone={statusTone(record.status)} />
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh prescription details" accessibilityState={{ disabled: loading || busy }} disabled={loading || busy} onPress={() => void load()} hitSlop={8}>
            <Txt variant="label" color="primaryContainer">Refresh</Txt>
          </Pressable>
        </View>
        <View style={styles.metaLine}><Icon name="calendar" size={16} color="onSurfaceVariant" /><Txt variant="bodySm" color="onSurfaceVariant">Created {new Date(record.created_at).toLocaleDateString('en-KE')}</Txt></View>
        {record.order_no ? <Pressable accessibilityRole="link" accessibilityLabel={`Open order ${record.order_no}`} onPress={() => router.push(`/orders/${encodeURIComponent(record.order_no!)}`)} style={styles.orderLine}>
          <Icon name="receipt" size={17} color="primaryContainer" /><Txt variant="label" color="primaryContainer">View order {record.order_no}</Txt><Icon name="arrow-right" size={16} color="primaryContainer" />
        </Pressable> : null}
      </Card>

      {record.status === 'ordered' && record.order_no ? <Card variant="tinted" padding={spacing.lg} style={styles.orderSuccess}>
        <Icon name="check-circle" size={20} color="primaryContainer" />
        <View style={styles.flex}>
          <Txt variant="label">Order recorded</Txt>
          <Txt variant="caption" color="onSurfaceVariant">Order {record.order_no} is linked to this prescription. Payment remains test/simulated in this flow.</Txt>
        </View>
      </Card> : null}

      <Card variant="elevated" padding={spacing.lg} style={styles.section}>
        <Txt variant="title">Request information</Txt>
        <Detail label="Patient" value={record.patient_name} />
        <Detail label="Prescription for" value={record.patient_kind === 'dependant' ? 'A dependant' : record.patient_kind === 'myself' ? 'Myself' : record.patient_kind} />
        <Detail label="Prescriber or facility" value={record.doctor} />
        <Detail label="Note for pharmacist" value={record.notes} />
      </Card>

      {isDraft ? <>
        <PhotoQueue
          assets={assets}
          onRemove={uri => setAssets(current => current.filter(asset => asset.uri !== uri))}
          onCamera={() => void changePhotos(true)}
          onGallery={() => void changePhotos(false)}
          disabled={busy || (record.files?.length ?? 0) + assets.length >= 5}
        />
        <Card variant="elevated" padding={spacing.lg} style={styles.section}>
          <Txt variant="title">Photos already attached</Txt>
          <PrivatePhotos files={record.files || []} />
          {record.files?.map(file => <View key={file.path} style={styles.existingFile}>
            <View style={styles.flex}><Txt variant="label">{file.name || 'Prescription photo'}</Txt><Txt variant="caption" color="onSurfaceVariant">Private prescription image</Txt></View>
            <Button label="Remove" size="sm" variant="outline" disabled={busy} onPress={() => removePhoto(file.path)} />
          </View>)}
        </Card>
        <Button label={busy ? 'Submitting securely…' : 'Submit for pharmacist review'} size="lg" fullWidth disabled={busy || (!assets.length && !(record.files?.length))} onPress={() => void submitDraft()} />
      </> : <Card variant="elevated" padding={spacing.lg} style={styles.section}>
        <View style={styles.sectionTitle}><Icon name="shield" size={18} color="primaryContainer" /><Txt variant="title">Prescription photos</Txt></View>
        <Txt variant="caption" color="onSurfaceVariant">Private to you and authorised pharmacy reviewers.</Txt>
        <PrivatePhotos files={record.files || []} />
      </Card>}

      {record.review_note ? <Card variant="tinted" padding={spacing.lg} style={styles.section}>
        <Txt variant="title">{record.status === 'rejected' ? 'Pharmacist’s review' : 'Pharmacist’s note'}</Txt>
        <Txt variant="bodySm" color="onSurfaceVariant">{record.review_note}</Txt>
      </Card> : null}

      <Card variant="elevated" padding={spacing.lg} style={styles.section}>
        <Txt variant="title">Decision history</Txt>
        <Txt variant="caption" color="onSurfaceVariant">Recorded request status changes and pharmacist decisions.</Txt>
        {eventsLoading ? <View style={styles.eventLoading}><View style={styles.skeletonWide} /><View style={styles.skeletonShort} /></View> :
          eventsError ? <ErrorNotice message={eventsError} onRetry={() => void loadEvents(record.id)} /> :
          events.length === 0 ? <Txt variant="bodySm" color="onSurfaceVariant">No decision events are available for this request.</Txt> :
          [...events].reverse().map(event => <View key={event.id} style={styles.eventRow}>
            <View style={styles.eventMarker}><Icon name="check-circle" size={17} color="primaryContainer" /></View>
            <View style={styles.flex}>
              <View style={styles.eventHeading}>
                <Txt variant="label">{STATUS_LABELS[event.status]}</Txt>
                <Txt variant="caption" color="onSurfaceVariant">{formatDateTime(event.created_at)}</Txt>
              </View>
              {event.review_note ? <Txt variant="bodySm" color="onSurfaceVariant">{event.review_note}</Txt> :
                <Txt variant="caption" color="onSurfaceVariant">No reviewer note recorded for this event.</Txt>}
            </View>
          </View>)}
      </Card>

      {isClarification ? <Card variant="elevated" padding={spacing.lg} style={styles.section}>
        <Txt variant="title">Reply to pharmacist</Txt>
        {record.clarification_response ? <Txt variant="bodySm" color="onSurfaceVariant">Your previous response: {record.clarification_response}</Txt> : null}
        <TextInput
          accessibilityLabel="Message for pharmacist"
          value={clarification}
          onChangeText={setClarification}
          maxLength={1000}
          placeholder="Add the information the pharmacist requested"
          placeholderTextColor={colors.outline}
          multiline
          textAlignVertical="top"
          style={styles.input}
        />
        <Button label={busy ? 'Sending…' : 'Send response'} disabled={busy || !clarification.trim()} onPress={() => void sendClarification()} />
      </Card> : null}

      {record.quote_lines?.length ? <Card variant="elevated" padding={spacing.lg} style={styles.section}>
        <View style={styles.quoteTitle}><View style={styles.flex}><Txt variant="title">Quoted medicines</Txt><Txt variant="caption" color="onSurfaceVariant">Pharmacist-provided item, quantity and price</Txt></View></View>
        {record.quote_lines.map((line, index) => <View key={`${line.item_no}-${index}`} style={styles.quoteLine}>
          <View style={styles.quoteName}>
            <Txt variant="label">{line.name}</Txt>
            <Txt variant="caption" color="onSurfaceVariant">Quantity {line.quantity} · {line.item_no}</Txt>
            {line.instructions ? <Txt variant="caption" color="onSurfaceVariant">{line.instructions}</Txt> : null}
          </View>
          <Txt variant="label">KSh {Number(line.unit_price).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} each</Txt>
        </View>)}
        <View style={styles.quoteTotal}>
          <Txt variant="label">Quoted subtotal</Txt>
          <Txt variant="title">KSh {record.quote_lines.reduce((sum, line) => sum + Number(line.unit_price) * line.quantity, 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Txt>
        </View>
        <View style={styles.expiry}><Icon name="clock" size={16} color="onSurfaceVariant" /><Txt variant="caption" color="onSurfaceVariant">Quote expiry: {formatDate(record.valid_until)}</Txt></View>
        {isQuoted ? <View style={styles.checkout}>
          <Txt variant="title">Order details</Txt>
          <Txt variant="caption" color="onSurfaceVariant">This order request uses the exact pharmacist quote. M-Pesa and cash on delivery are test/simulated here; no payment will be collected.</Txt>
          <View style={styles.modeRow}>
            <SelectableOption title="Delivery" description="Use your saved delivery settings" icon="delivery" selected={fulfilment.mode === 'delivery'} onPress={() => chooseFulfilmentMode('delivery')} />
            <SelectableOption title="Pickup" description="Choose a store for collection" icon="pickup" selected={fulfilment.mode === 'pickup'} onPress={() => chooseFulfilmentMode('pickup')} />
          </View>
          {fulfilment.mode === 'pickup' ? <View style={styles.chipRow}>{stores.map(store => <Chip key={store.id} label={store.name} selected={fulfilment.storeId === store.id} onPress={() => fulfilment.setStoreId(store.id)} />)}</View> : <>
            <InputField label="Delivery address" value={addressLine} onChangeText={setAddressLine} placeholder="Enter delivery address" />
            {!fulfilment.hasAddress && !addressLine.trim() ? <Txt variant="caption" color="warning">No saved delivery address. Add an address or switch to pickup.</Txt> : null}
          </>}
          <Txt variant="label">{fulfilment.mode === 'pickup' ? 'Collection window' : 'Delivery window'}</Txt>
          <View style={styles.chipRow}>
            {deliverySlots.filter(slot => slot.mode === fulfilment.mode).map(slot => <Chip
              key={slot.id}
              label={slot.mode === 'pickup' ? `Pickup · ${fulfilment.store.name}` : `${slot.label} · ${slot.window}`}
              selected={fulfilment.slotId === slot.id}
              onPress={() => fulfilment.setSlotId(slot.id)}
            />)}
          </View>
          <InputField label="Contact number" value={contact} onChangeText={setContact} placeholder="+254…" keyboardType="phone-pad" />
          <Txt variant="label">Payment choice · test simulation only</Txt>
          <View style={styles.paymentRow}>
            <Chip label="M-Pesa · simulated" selected={fulfilment.paymentMethod !== 'cod'} icon="mpesa" onPress={() => fulfilment.setPaymentMethod('mpesa')} />
            <Chip label="Cash on delivery · test" selected={fulfilment.paymentMethod === 'cod'} icon="cash" onPress={() => fulfilment.setPaymentMethod('cod')} />
          </View>
          <View style={styles.fulfilmentMeta}>
            <Txt variant="caption" color="onSurfaceVariant">Store: {fulfilment.store.name}</Txt>
            <Txt variant="caption" color="onSurfaceVariant">Fulfilment: {fulfilment.mode === 'pickup' ? `Pickup at ${fulfilment.store.name}` : `${fulfilment.slot.label} · ${fulfilment.slot.window}`}</Txt>
          </View>
          {quoteExpired || !record.quoted_at ? <ErrorNotice message="This quote is expired or missing its review timestamp. Ask the pharmacist to refresh it before ordering." onRetry={() => void load()} /> : null}
          <Button label={busy ? 'Placing order…' : 'Confirm quoted order'} size="lg" fullWidth disabled={busy || clockNow === null || quoteExpired || !record.quoted_at || !contact.trim() || (fulfilment.mode === 'delivery' && !addressLine.trim())} onPress={() => void placeOrder()} />
          <Txt variant="caption" color="onSurfaceVariant">No cart is used or cleared. No points or real payment are applied.</Txt>
        </View> : null}
      </Card> : null}

      {canCancel ? <Button label="Cancel prescription" variant="danger" disabled={busy} onPress={cancelRequest} /> : null}
      {error && !pendingAction ? <View style={styles.inlineError}>
        {backendConfigMissing ? <Txt variant="caption" color="onSurfaceVariant">The prescription service is not configured or is temporarily unavailable.</Txt> : null}
        <ErrorNotice message={error} onRetry={() => void load()} />
      </View> : null}
      {loading && record ? <Txt variant="caption" color="onSurfaceVariant" align="center">Refreshing request…</Txt> : null}
      <Button label="Back to prescriptions" variant="outline" fullWidth onPress={backToList} />
    </> : null}
    <BottomSheet
      visible={!!pendingAction}
      onClose={() => {
        if (busy) return;
        setPendingAction(null);
        setError('');
      }}
      title={pendingAction?.kind === 'place-order' ? 'Confirm quoted order' : pendingAction?.kind === 'remove-photo' ? 'Remove prescription photo?' : 'Cancel this prescription?'}
      description={pendingAction?.kind === 'place-order' ? 'Review this final step before sending the order request.' : undefined}
      footer={<View style={styles.sheetActions}>
        <Button label={busy ? 'Please wait…' : pendingAction?.kind === 'remove-photo' ? 'Keep photo' : pendingAction?.kind === 'place-order' ? 'Back to review' : 'Keep request'} variant="outline" disabled={busy} style={{ flex: 1 }} onPress={() => { setPendingAction(null); setError(''); }} />
        <Button
          label={busy ? 'Working…' : pendingAction?.kind === 'place-order' ? 'Confirm order' : pendingAction?.kind === 'remove-photo' ? 'Remove photo' : 'Cancel prescription'}
          variant={pendingAction?.kind === 'cancel-request' || pendingAction?.kind === 'remove-photo' ? 'danger' : 'primary'}
          disabled={busy || !pendingAction}
          style={{ flex: 1 }}
          onPress={() => void confirmPendingAction()}
        />
      </View>}
    >
      <Txt variant="bodySm" color="onSurfaceVariant">
        {pendingAction?.kind === 'place-order'
          ? 'This uses the pharmacist’s exact quote. Payment is test/simulated only; no real payment will be collected.'
          : pendingAction?.kind === 'remove-photo'
            ? 'This photo will be detached from the prescription draft. The remaining photos will stay private.'
            : 'This request will be marked cancelled and will no longer be available for ordering.'}
      </Txt>
      {error ? <ErrorNotice message={error} /> : null}
    </BottomSheet>
  </Screen>;
}

function InputField({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default' | 'phone-pad';
}) {
  return <View style={styles.inputField}>
    <Txt variant="label">{label}</Txt>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder}
      placeholderTextColor={colors.outline} keyboardType={keyboardType} style={styles.input} />
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.giant },
  summary: { gap: spacing.md }, summaryHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1, gap: spacing.xs }, metaLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  orderLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant, paddingTop: spacing.sm },
  orderSuccess: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  section: { gap: spacing.md }, sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eventLoading: { gap: spacing.sm }, eventRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant },
  eventMarker: { width: 28, height: 28, borderRadius: radius.pill, backgroundColor: colors.mintSurface, alignItems: 'center', justifyContent: 'center' }, eventHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  detail: { gap: spacing.xxs, paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant },
  existingFile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant },
  quoteTitle: { flexDirection: 'row', alignItems: 'center' }, quoteLine: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant },
  quoteName: { flex: 1, gap: spacing.xs }, quoteTotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant, paddingTop: spacing.md }, expiry: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant, paddingTop: spacing.md },
  checkout: { gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant, paddingTop: spacing.lg },
  modeRow: { gap: spacing.sm }, chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, paymentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  fulfilmentMeta: { gap: spacing.xxs, padding: spacing.md, backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md },
  inputField: { gap: spacing.xs }, input: { minHeight: 46, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLowest, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.onSurface, fontSize: 15 },
  stateCard: { gap: spacing.md }, configNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  inlineError: { gap: spacing.sm }, loadingCard: { gap: spacing.md, alignItems: 'flex-start' },
  sheetActions: { flexDirection: 'row', gap: spacing.sm },
  skeletonWide: { height: 24, width: '62%', borderRadius: radius.sm, backgroundColor: colors.surfaceContainerLow },
  skeletonShort: { height: 14, width: '38%', borderRadius: radius.sm, backgroundColor: colors.surfaceContainerLow },
  skeletonBlock: { height: 96, width: '100%', borderRadius: radius.md, backgroundColor: colors.surfaceContainerLow },
});
