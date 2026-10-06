import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Badge, Button, Card, Icon, Screen, TopBar, Txt } from '@/components/ui';
import { LIVE_PHARMACY_CATEGORIES, searchCatalogue } from '@/data/live-catalogue';
import type { Product } from '@/data/types';
import {
  isPharmacyReviewer, prescriptionError, reviewPrescription, setPrescriptionReviewStatus,
  STATUS_LABELS, usePrescriptionList, type Prescription, type PrescriptionStatus, type QuoteChoice,
} from '@/features/prescriptions/api';
import { ErrorNotice, PrivatePhotos } from '@/features/prescriptions/ui';
import { useSession } from '@/store/session';
import { colors, radius, spacing } from '@/theme';

type Access = 'checking' | 'allowed' | 'denied' | 'failed';
type DraftLine = QuoteChoice & { name: string; unitPrice: number };

const isConfigIssue = (error: unknown) => {
  const message = error && typeof error === 'object'
    ? `${'message' in error ? String(error.message) : ''} ${'code' in error ? String(error.code) : ''}`.toLowerCase()
    : '';
  return ['does not exist', 'schema cache', 'could not find function', 'pgrst202', 'pgrst205', '42p01'].some(part => message.includes(part));
};

function tone(status: PrescriptionStatus): 'neutral' | 'info' | 'fresh' | 'warning' {
  const map: Record<string, 'neutral' | 'info' | 'fresh' | 'warning'> = {
    draft: 'neutral', submitted: 'info', quoted: 'fresh', rejected: 'warning',
    ordered: 'fresh', cancelled: 'neutral', clarification: 'info', held: 'warning',
  };
  return map[status] ?? 'neutral';
}

export default function PharmacyReviewScreen() {
  const router = useRouter();
  const { isAuthenticated } = useSession();
  const { records, loading, error, refresh } = usePrescriptionList(true);
  const [access, setAccess] = useState<Access>('checking');
  const [accessError, setAccessError] = useState('');
  const [backendConfigPending, setBackendConfigPending] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [catalogueError, setCatalogueError] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [note, setNote] = useState('');
  const [expiry, setExpiry] = useState('');
  const reviewableRecords = useMemo(
    () => records.filter(item => ['submitted', 'quoted', 'clarification', 'held'].includes(item.status)),
    [records],
  );
  const selected = useMemo(() => reviewableRecords.find(item => item.id === selectedId), [reviewableRecords, selectedId]);
  const quoteTotal = useMemo(() => lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0), [lines]);

  const checkPermission = useCallback(async () => {
    setAccess('checking');
    setAccessError('');
    setBackendConfigPending(false);
    if (!isAuthenticated) {
      setAccess('denied');
      return;
    }
    try {
      const authorised = await isPharmacyReviewer();
      setAccess(authorised ? 'allowed' : 'denied');
    } catch (cause) {
      setAccess('failed');
      setAccessError(prescriptionError(cause));
      setBackendConfigPending(isConfigIssue(cause));
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const timer = setTimeout(() => { void checkPermission(); }, 0);
    return () => clearTimeout(timer);
  }, [checkPermission]);
  useFocusEffect(useCallback(() => {
    if (access === 'allowed') void refresh();
  }, [access, refresh]));

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) return;
    let active = true;
    const timer = setTimeout(() => {
      if (!active) return;
      setSearching(true);
      void searchCatalogue(term, 24).then(found => {
        if (active) setProducts(found.filter(item =>
          item.inStock && !item.ageRestricted && LIVE_PHARMACY_CATEGORIES.includes(item.category) &&
          item.category !== 'controlled-medicines',
        ));
      }).catch(cause => {
        if (active) setCatalogueError(prescriptionError(cause));
      }).finally(() => {
        if (active) setSearching(false);
      });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search]);

  const updateSearch = (value: string) => {
    setSearch(value);
    setProducts([]);
    setSearching(false);
    setCatalogueError('');
  };

  const choose = (record: Prescription) => {
    if (busy) return;
    setSelectedId(record.id);
    setLines(record.quote_lines.map(line => ({
      itemNo: line.item_no, quantity: line.quantity, instructions: line.instructions || '',
      name: line.name, unitPrice: Number(line.unit_price),
    })));
    setNote(record.review_note || '');
    setExpiry(record.valid_until ? record.valid_until.slice(0, 10) : '');
    setSearch('');
    setProducts([]);
    setSearching(false);
    setCatalogueError('');
  };

  const addProduct = (product: Product) => {
    if (busy) return;
    setLines(current => current.some(line => line.itemNo === product.id) ? current : [
      ...current, { itemNo: product.id, quantity: 1, instructions: '', name: product.name, unitPrice: product.price },
    ]);
  };

  const updateLine = (itemNo: string, patch: Partial<DraftLine>) => {
    if (!busy) setLines(current => current.map(line => line.itemNo === itemNo ? { ...line, ...patch } : line));
  };
  const removeLine = (itemNo: string) => { if (!busy) setLines(current => current.filter(line => line.itemNo !== itemNo)); };

  const runReview = async (reject: boolean) => {
    if (!selected || busy) return;
    if (reject && !note.trim()) {
      setCatalogueError('Enter a specific reason in the reviewer note before declining. This reason will be shown to the customer.');
      return;
    }
    const expiryTime = expiry ? new Date(`${expiry}T23:59:59`).getTime() : NaN;
    if (!reject && (!lines.length || !note.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(expiry) ||
      !Number.isFinite(expiryTime) || expiryTime <= Date.now() || expiryTime > Date.now() + 365 * 24 * 60 * 60 * 1000)) {
      setCatalogueError('Add at least one in-stock medicine, a reviewer note, and a future quote expiry date.');
      return;
    }
    setBusy(true);
    setCatalogueError('');
    try {
      await reviewPrescription(
        selected.id,
        lines.map(({ itemNo, quantity, instructions }) => ({ itemNo, quantity, instructions })),
        note.trim(),
        expiry ? `${expiry}T23:59:59.000Z` : '',
        reject,
      );
      setSelectedId('');
      await refresh();
    } catch (cause) {
      setCatalogueError(prescriptionError(cause));
      setBackendConfigPending(isConfigIssue(cause));
    } finally {
      setBusy(false);
    }
  };

  const setReviewStatus = async (status: 'clarification' | 'held') => {
    if (busy || !selected) return;
    if (!note.trim()) {
      setCatalogueError(status === 'clarification'
        ? 'Enter the information the customer needs to provide before requesting clarification.'
        : 'Enter the reason this request is being placed on hold.');
      return;
    }
    setBusy(true);
    setCatalogueError('');
    try {
      await setPrescriptionReviewStatus(selected.id, status, note.trim());
      setSelectedId('');
      await refresh();
    } catch (cause) {
      setCatalogueError(prescriptionError(cause));
      setBackendConfigPending(isConfigIssue(cause));
    } finally {
      setBusy(false);
    }
  };

  const backendMissing = backendConfigPending || isConfigIssue(accessError || error || catalogueError);
  return <Screen padded contentStyle={styles.content}>
    <TopBar title="Pharmacy review" subtitle="Authorised reviewer workspace" onBack={() => router.replace('/(tabs)/pharmacy')} />
    {access === 'checking' ? <Card variant="flat" padding={spacing.lg} style={styles.state}>
      <ActivityIndicator accessibilityLabel="Checking reviewer access" color={colors.primary} />
      <Txt variant="bodySm" color="onSurfaceVariant">Checking pharmacy reviewer access…</Txt>
    </Card> : access === 'denied' ? <Card variant="elevated" padding={spacing.lg} style={styles.state}>
      <Icon name="lock" size={22} color="primaryContainer" />
      <Txt variant="title">{isAuthenticated ? 'Reviewer access required' : 'Sign in required'}</Txt>
      <Txt variant="bodySm" color="onSurfaceVariant">{isAuthenticated ? 'This review queue is only available to accounts authorised by the pharmacy team.' : 'Sign in with an authorised pharmacy reviewer account to continue.'}</Txt>
      {!isAuthenticated ? <Button label="Sign in" onPress={() => router.push('/login')} /> : null}
      <Button label="Back to pharmacy" variant="outline" onPress={() => router.replace('/(tabs)/pharmacy')} />
    </Card> : access === 'failed' ? <View style={styles.state}>
      {backendMissing ? <Card variant="tinted" padding={spacing.lg} style={styles.configNotice}><Icon name="info" size={18} color="primaryContainer" /><Txt variant="bodySm" color="onSurfaceVariant" style={styles.flex}>The authorised reviewer service is unavailable or not configured, so access cannot be confirmed.</Txt></Card> : null}
      <ErrorNotice message={accessError || 'Reviewer access could not be checked.'} onRetry={() => void checkPermission()} />
      <Button label="Back to pharmacy" variant="outline" onPress={() => router.replace('/(tabs)/pharmacy')} />
    </View> : <>
      <Card variant="tinted" padding={spacing.lg} style={styles.notice}>
        <Icon name="shield" size={18} color="primaryContainer" />
        <Txt variant="bodySm" color="onSurfaceVariant" style={styles.flex}>Private customer requests. Review actions are sent through the authorised prescription review service; no order or payment is placed here.</Txt>
      </Card>
      {backendMissing ? <Card variant="tinted" padding={spacing.lg} style={styles.configNotice}><Icon name="info" size={18} color="primaryContainer" /><Txt variant="bodySm" color="onSurfaceVariant" style={styles.flex}>The prescription backend service is unavailable or not configured in this environment.</Txt></Card> : null}
      {error ? <>
        <Card variant="tinted" padding={spacing.md}><Txt variant="caption" color="onSurfaceVariant">Review requests could not be loaded. Retry to refresh the queue.</Txt></Card>
        <ErrorNotice message={error} onRetry={() => void refresh()} />
      </> : null}
      {loading && records.length === 0 ? <Card variant="flat" padding={spacing.lg} style={styles.state}><ActivityIndicator accessibilityLabel="Loading review queue" color={colors.primary} /><Txt variant="bodySm" color="onSurfaceVariant">Loading requests…</Txt></Card> : null}
      {!loading && !error && reviewableRecords.length === 0 ? <Card variant="elevated" padding={spacing.lg} style={styles.state}>
        <Icon name="prescription" size={24} color="primaryContainer" />
        <Txt variant="title">No requests in the queue</Txt>
        <Txt variant="bodySm" color="onSurfaceVariant">New customer submissions will appear here when the prescription service is available.</Txt>
        <Button label="Refresh queue" variant="outline" disabled={busy} onPress={() => void refresh()} />
      </Card> : null}
      {reviewableRecords.length > 0 ? <View style={styles.queueSection}>
          <View style={styles.queueHeader}><Txt variant="titleLg">Requests</Txt><Button label="Refresh" size="sm" variant="outline" disabled={busy} onPress={() => void refresh()} /></View>
        <View style={styles.queue}>
          {reviewableRecords.map(record => <Pressable key={record.id} accessibilityRole="button" accessibilityLabel={`Review request for ${record.patient_name}, ${STATUS_LABELS[record.status]}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => choose(record)}>
            <Card variant={selectedId === record.id ? 'tinted' : 'elevated'} padding={spacing.md} style={styles.queueCard}>
              <View style={styles.queueTop}><View style={styles.flex}>
                <Txt variant="label">{record.patient_name || 'Patient name not provided'}</Txt>
                <Txt variant="caption" color="onSurfaceVariant">{new Date(record.created_at).toLocaleDateString('en-KE')} · {record.files?.length ?? 0} private photos</Txt>
              </View><Badge label={STATUS_LABELS[record.status]} tone={tone(record.status)} /></View>
              <Txt variant="caption" color="onSurfaceVariant">{record.doctor ? `Prescriber: ${record.doctor}` : 'Prescriber not provided'}</Txt>
              <Txt variant="label" color="primaryContainer">{selectedId === record.id ? 'Selected for review' : 'Open request'}</Txt>
            </Card>
          </Pressable>)}
        </View>
      </View> : null}
      {selected ? <View style={styles.editor}>
        <Card variant="elevated" padding={spacing.lg} style={styles.section}>
          <View style={styles.editorTitle}>
            <View style={styles.flex}><Txt variant="caption" color="onSurfaceVariant">REVIEW REQUEST</Txt><Txt variant="title">{selected.patient_name}</Txt></View>
          <Button label="Close" size="sm" variant="outline" disabled={busy} onPress={() => setSelectedId('')} />
          </View>
          <Txt variant="bodySm" color="onSurfaceVariant">Patient type: {selected.patient_kind || 'Not provided'} · Prescriber: {selected.doctor || 'Not provided'}</Txt>
          {selected.notes ? <Txt variant="bodySm" color="onSurfaceVariant">Customer note: {selected.notes}</Txt> : null}
          <PrivatePhotos files={selected.files || []} />
          {selected.review_note ? <Card variant="tinted" padding={spacing.md}><Txt variant="caption" color="onSurfaceVariant">Prior reviewer note</Txt><Txt variant="bodySm">{selected.review_note}</Txt></Card> : null}
        </Card>
        <Card variant="elevated" padding={spacing.lg} style={styles.section}>
          <Txt variant="title">Find catalogue medicines</Txt>
          <TextInput accessibilityLabel="Search live medicine catalogue" value={search} onChangeText={updateSearch} editable={!busy} placeholder="Search the live catalogue" placeholderTextColor={colors.outline} style={styles.input} />
          {searching ? <ActivityIndicator accessibilityLabel="Searching catalogue" color={colors.primary} /> : null}
          {catalogueError && !selected ? <ErrorNotice message={catalogueError} /> : null}
          {products.map(product => <View key={product.id} style={styles.productRow}>
            <View style={styles.flex}><Txt variant="label">{product.name}</Txt><Txt variant="caption" color="onSurfaceVariant">{product.id} · KSh {product.price.toLocaleString('en-KE', { minimumFractionDigits: 2 })} · In stock</Txt></View>
            <Button label={lines.some(line => line.itemNo === product.id) ? 'Added' : 'Add'} size="sm" variant="outline" disabled={busy || lines.some(line => line.itemNo === product.id)} onPress={() => addProduct(product)} />
          </View>)}
          {search.trim().length >= 2 && !searching && products.length === 0 && !catalogueError ? <Txt variant="caption" color="onSurfaceVariant">No in-stock catalogue matches. Try another search.</Txt> : null}
          <Txt variant="title">Quote lines</Txt>
          {lines.map(line => <View key={line.itemNo} style={styles.lineEditor}>
            <View style={styles.flex}>
              <Txt variant="label">{line.name}</Txt>
              <Txt variant="caption" color="onSurfaceVariant">KSh {line.unitPrice.toLocaleString('en-KE', { minimumFractionDigits: 2 })} each</Txt>
              <View style={styles.quantity}>
                <Txt variant="caption" color="onSurfaceVariant">Quantity</Txt>
                <View style={styles.quantityActions}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${line.name} quantity`} accessibilityState={{ disabled: busy || line.quantity <= 1 }} disabled={busy || line.quantity <= 1} onPress={() => updateLine(line.itemNo, { quantity: line.quantity - 1 })} style={styles.quantityButton}>
                    <Icon name="minus" size={16} color="primaryContainer" />
                  </Pressable>
                  <Txt variant="label">{line.quantity}</Txt>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${line.name} quantity`} accessibilityState={{ disabled: busy || line.quantity >= 999 }} disabled={busy || line.quantity >= 999} onPress={() => updateLine(line.itemNo, { quantity: Math.min(999, line.quantity + 1) })} style={styles.quantityButton}>
                    <Icon name="plus" size={16} color="primaryContainer" />
                  </Pressable>
                </View>
              </View>
              <TextInput accessibilityLabel={`Instructions for ${line.name}`} value={line.instructions} maxLength={500} editable={!busy} onChangeText={value => updateLine(line.itemNo, { instructions: value })} placeholder="Instructions for customer (optional)" placeholderTextColor={colors.outline} style={styles.input} />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${line.name} from quote`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => removeLine(line.itemNo)} style={styles.removeButton}>
              <Txt variant="label" color="primaryContainer">Remove</Txt>
            </Pressable>
          </View>)}
          {lines.length ? <View style={styles.totalPreview}>
            <Txt variant="caption" color="onSurfaceVariant">Current catalogue subtotal · prices rechecked when quote is saved</Txt>
            <Txt variant="title">KSh {quoteTotal.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Txt>
          </View> : null}
          <View style={styles.inputField}><Txt variant="label">Quote expiry date</Txt><TextInput accessibilityLabel="Quote expiry date" value={expiry} onChangeText={setExpiry} editable={!busy} placeholder="YYYY-MM-DD" placeholderTextColor={colors.outline} style={styles.input} /></View>
          <View style={styles.inputField}><Txt variant="label">Reviewer note or decline reason</Txt><TextInput accessibilityLabel="Reviewer note" value={note} onChangeText={setNote} editable={!busy} maxLength={1000} multiline textAlignVertical="top" placeholder="Write the real review note for the customer" placeholderTextColor={colors.outline} style={[styles.input, styles.multiline]} /></View>
          <View style={styles.actionStack}>
            <Button label={busy ? 'Saving review…' : 'Send priced quote'} size="lg" disabled={busy || !lines.length} onPress={() => void runReview(false)} />
            <Button label="Decline request" variant="outline" disabled={busy} onPress={() => void runReview(true)} />
            <Button label="Request clarification" variant="outline" disabled={busy} onPress={() => void setReviewStatus('clarification')} />
            <Button label="Place on hold" variant="outline" disabled={busy} onPress={() => void setReviewStatus('held')} />
          </View>
          {catalogueError && selected ? <ErrorNotice message={catalogueError} /> : null}
        </Card>
      </View> : null}
    </>}
  </Screen>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.giant },
  state: { gap: spacing.md, alignItems: 'flex-start' }, notice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  configNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, flex: { flex: 1, gap: spacing.xs },
  queueSection: { gap: spacing.md }, queueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, queue: { gap: spacing.sm },
  queueCard: { gap: spacing.sm }, queueTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  editor: { gap: spacing.md, marginTop: spacing.md }, section: { gap: spacing.md }, editorTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: { minHeight: 46, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLowest, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.onSurface, fontSize: 15 },
  multiline: { minHeight: 90, textAlignVertical: 'top' }, inputField: { gap: spacing.xs }, productRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant },
  lineEditor: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant },
  quantity: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.sm }, quantityActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  quantityButton: { width: 40, height: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.outlineVariant, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceContainerLowest },
  removeButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  totalPreview: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant },
  actionStack: { gap: spacing.sm },
});
