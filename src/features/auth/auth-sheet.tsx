import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { BottomSheet, Button, Icon, ProgressBar, Txt, type IconName } from '@/components/ui';
import type { FunctionError } from '@/lib/supabase';
import { useSession } from '@/store/session';
import { fonts, radius, spacing } from '@/theme';
import { useTheme, useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

/**
 * Screen 6a — Checkout (Login Sheet): the sign-in prompt opened from checkout,
 * plus the pieces the standalone `/login` route (Screen 11) reuses so both hosts
 * render the same form and the same verification step.
 *
 * Email first, phone second (Roystone, 27 Oct 2026). Email only reaches an
 * account that has confirmed the address, so the phone route stays one tap away
 * for new customers.
 */

/** Digits in the SMS code, in the design and in the `request-otp` Edge Function. */
export const OTP_LENGTH = 6;
/** Seconds the resend link stays disabled after a code is issued. */
const RESEND_SECONDS = 30;

export const PHONE_INVALID_MESSAGE = 'Enter a valid Kenyan mobile number, e.g. 0712 345 678.';
export const EMAIL_INVALID_MESSAGE = 'Enter a valid email address, e.g. amina@gmail.com.';
export const CODE_INVALID_MESSAGE = "That code doesn't match. Check the 6 digits and try again.";

const SIGN_IN_MESSAGES: Record<FunctionError, string> = {
  invalid_phone: PHONE_INVALID_MESSAGE,
  too_soon: 'A code was just sent. Wait 30 seconds before asking for another.',
  too_many: 'Too many codes requested. Try again in an hour.',
  sms_failed: "We couldn't send the SMS just now. Please try again.",
  sms_limit: 'SMS sign-in is temporarily at capacity. Please try again later.',
  sms_paused: 'SMS sign-in is temporarily unavailable. Please try again later.',
  sms_blocked:
    'Your network blocked our text because promotional SMS are switched off on this number. Switch them back on with your network provider, or try another number.',
  wrong_code: CODE_INVALID_MESSAGE,
  expired: 'That code has expired. Tap resend for a new one.',
  too_many_attempts: 'Too many wrong tries. Tap resend for a new code.',
  invalid_email: EMAIL_INVALID_MESSAGE,
  email_limit: 'Email sign-in is busy right now. Please try again in a few minutes, or use your phone number.',
  email_failed: "We couldn't send the email just now. Please try again, or use your phone number.",
  email_unavailable: 'Email sign-in is unavailable right now. Please use your phone number.',
  email_taken: 'This email is already linked to another account. Use a different email.',
  already_confirmed: 'This email is already confirmed on your account.',
  session_expired: 'You were signed out. Please sign in again.',
  server_error: 'Something went wrong on our side. Please try again.',
  network: 'No connection. Check your internet and try again.',
};

/** The line shown under the field for a failed send or verify. */
export function signInErrorMessage(error: FunctionError): string {
  return SIGN_IN_MESSAGES[error];
}

/** Kenyan dialling prefix presentation: international (+254) or local (0). */
export type PhonePrefix = '+254' | '0';
/** How the code is delivered — the "SEND CODE VIA" choice in Screen 6a. */
export type SignInChannel = 'sms' | 'whatsapp';

export type PhoneInput = { digits: string; prefix: PhonePrefix; channel: SignInChannel };

export const EMPTY_PHONE_INPUT: PhoneInput = { digits: '', prefix: '+254', channel: 'sms' };

const NATIONAL_LENGTH = 9;

/** Keeps the nine national digits, dropping any `+254` / `0` the user typed or pasted. */
function nationalDigits(input: string): string {
  const digits = input.replace(/\D/g, '');
  const withoutCode = digits.startsWith('254') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits;
  return withoutCode.slice(0, NATIONAL_LENGTH);
}

/** `712345678` → `712 345 678` — the digit grouping used across the frames. */
function groupDigits(digits: string): string {
  return (digits.match(/\d{1,3}/g) ?? []).join(' ');
}

/** Valid Kenyan mobile — the same shape the session store accepts (`07…`/`01…`, `+2547…`/`+2541…`). */
export function isValidPhone(input: PhoneInput): boolean {
  return /^[17]\d{8}$/.test(input.digits);
}

/** The value handed to `requestOtp`: `+254712345678` or `0712345678`. */
export function phoneFromInput(input: PhoneInput): string {
  return `${input.prefix}${input.digits}`;
}

/** `+254712345678` → `+254 712 345 678`, for the OTP instruction line. */
export function formatPhoneDisplay(phone: string): string {
  return `+254 ${groupDigits(nationalDigits(phone))}`;
}

/** `27` → `0:27` — the countdown shown beside "Didn't receive code?". */
function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const CHANNELS: { value: SignInChannel; label: string; icon: IconName }[] = [
  { value: 'sms', label: 'SMS', icon: 'message' },
];

/** Inline failure note used by both steps — the design's error state. */
function ErrorNote({ message }: { message: string }) {
  const styles = useThemeStyles(createStyles);
  return (
    <View style={styles.error} accessibilityLiveRegion="polite">
      <Icon name="alert" size={14} color="error" />
      <Txt variant="bodySm" color="error" style={styles.errorText}>
        {message}
      </Txt>
    </View>
  );
}

/** Phone field, helper line and delivery-channel choice from Screen 6a. */
export function PhoneSignInForm({
  value,
  onChange,
  onSubmit,
  error,
}: {
  value: PhoneInput;
  onChange: (next: PhoneInput) => void;
  /** The keyboard's Enter / Go key: same as tapping the send button. */
  onSubmit?: () => void;
  error?: string;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const [focused, setFocused] = useState(false);
  const nextPrefix: PhonePrefix = value.prefix === '+254' ? '0' : '+254';

  return (
    <View style={styles.form}>
      <Txt variant="overline" color="onSurfaceVariant">
        Phone number
      </Txt>

      <View style={[styles.field, focused ? styles.fieldFocused : null]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Kenya country code"
          accessibilityHint={`Switch to the ${nextPrefix} prefix`}
          onPress={() => onChange({ ...value, prefix: nextPrefix })}
          style={styles.prefix}
        >
          <Txt variant="body">🇰🇪</Txt>
          <Txt variant="label">{value.prefix}</Txt>
          <Icon name="chevron-down" size={14} color="onSurfaceVariant" />
        </Pressable>
        <TextInput
          value={groupDigits(value.digits)}
          onChangeText={text => onChange({ ...value, digits: nationalDigits(text) })}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="712 345 678"
          placeholderTextColor={colors.outline}
          keyboardType="number-pad"
          inputMode="numeric"
          returnKeyType="go"
          enterKeyHint="go"
          onSubmitEditing={onSubmit}
          maxLength={16}
          accessibilityLabel="Mobile number"
          style={styles.input}
        />
      </View>

      {error ? <ErrorNote message={error} /> : null}

      <View style={styles.helper}>
        <Icon name="info" size={14} color="primaryAccent" />
        <Txt variant="caption" color="onSurfaceVariant" style={styles.helperText}>
          {`We'll send a 6-digit ${value.channel === 'sms' ? 'SMS' : 'WhatsApp'} verification code.`}
        </Txt>
      </View>

      <View style={styles.channels}>
        <Txt variant="overline" color="onSurfaceVariant">
          Send code via
        </Txt>
        <View style={styles.channelRow}>
          {CHANNELS.map(channel => {
            const selected = value.channel === channel.value;
            return (
              <Pressable
                key={channel.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={channel.label}
                onPress={() => onChange({ ...value, channel: channel.value })}
                style={[styles.channel, selected ? styles.channelSelected : null]}
              >
                <View style={[styles.radio, selected ? styles.radioSelected : null]}>
                  {selected ? <Icon name="check" size={10} color="onPrimary" /> : null}
                </View>
                <Icon name={channel.icon} size={15} color={selected ? 'primaryAccent' : 'onSurfaceVariant'} />
                <Txt variant="label" color={selected ? 'primaryAccent' : 'onSurfaceVariant'}>
                  {channel.label}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/** Email field and helper line: the first way in. */
export function EmailSignInForm({
  value,
  onChange,
  onSubmit,
  error,
  helper = "We'll email you a 6-digit code.",
}: {
  value: string;
  onChange: (next: string) => void;
  /** The keyboard's Enter / Go key: same as tapping the send button. */
  onSubmit?: () => void;
  error?: string;
  helper?: string;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.form}>
      <Txt variant="overline" color="onSurfaceVariant">
        Email
      </Txt>
      <View style={[styles.field, styles.emailField, focused ? styles.fieldFocused : null]}>
        <Icon name="mail" size={18} color="onSurfaceVariant" />
        <TextInput
          value={value}
          onChangeText={text => onChange(text.replace(/\s/g, ''))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="you@example.com"
          placeholderTextColor={colors.outline}
          keyboardType="email-address"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="go"
          enterKeyHint="go"
          onSubmitEditing={onSubmit}
          maxLength={254}
          accessibilityLabel="Email address"
          style={styles.input}
        />
      </View>

      {error ? <ErrorNote message={error} /> : null}

      <View style={styles.helper}>
        <Icon name="info" size={14} color="primaryAccent" />
        <Txt variant="caption" color="onSurfaceVariant" style={styles.helperText}>
          {helper}
        </Txt>
      </View>
    </View>
  );
}

/** The quiet link that swaps email for phone and back, under the form. */
export function SignInMethodSwitch({ method, onSwitch }: { method: SignInMethod; onSwitch: () => void }) {
  const styles = useThemeStyles(createStyles);
  const toPhone = method === 'email';
  return (
    <View style={styles.switchRow}>
      <Txt variant="bodySm" color="onSurfaceVariant" align="center">
        {toPhone ? 'New here, or no email linked yet?' : 'Have an email linked to your account?'}
      </Txt>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={onSwitch}>
        <Txt variant="label" color="primaryAccent" align="center">
          {toPhone ? 'Use your phone number' : 'Use your email'}
        </Txt>
      </Pressable>
    </View>
  );
}

/** "Change number" / "Change email" link above the code cells (Screen 11). */
export function ChangeNumberLink({ onPress, label = 'Change number' }: { onPress: () => void; label?: string }) {
  const styles = useThemeStyles(createStyles);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress} style={styles.changeNumber}>
      <Txt variant="label" color="primaryAccent">
        {label}
      </Txt>
    </Pressable>
  );
}

export type SignInMethod = 'email' | 'phone';

/**
 * The state behind both sign-in hosts: which way in, the typed address, the
 * code and the calls. `onSignedIn` runs once the session is set.
 */
export function useSignInFlow(onSignedIn: () => void) {
  const { requestOtp, verify, requestEmailCode, verifyEmail } = useSession();
  const [method, setMethod] = useState<SignInMethod>('email');
  const [step, setStep] = useState<'enter' | 'code'>('enter');
  const [phone, setPhone] = useState<PhoneInput>(EMPTY_PHONE_INPUT);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const request = async () =>
    method === 'email' ? requestEmailCode(email) : requestOtp(phoneFromInput(phone));

  const sendCode = async () => {
    if (busy) return;
    if (method === 'phone' && !isValidPhone(phone)) {
      setError(PHONE_INVALID_MESSAGE);
      return;
    }
    setBusy(true);
    const result = await request();
    setBusy(false);
    if (!result.ok) {
      setError(signInErrorMessage(result.error));
      return;
    }
    setSentTo('email' in result ? result.email : formatPhoneDisplay(result.phone));
    setCode('');
    setError('');
    setStep('code');
  };

  const resendCode = async () => {
    if (busy) return;
    setBusy(true);
    setCode('');
    const result = await request();
    setBusy(false);
    setError(result.ok ? '' : signInErrorMessage(result.error));
  };

  const confirmCode = async (entered = code) => {
    if (busy || entered.length < OTP_LENGTH) return;
    setBusy(true);
    const result = method === 'email' ? await verifyEmail(entered) : await verify(entered);
    setBusy(false);
    if (!result.ok) {
      setError(signInErrorMessage(result.error));
      setCode('');
      return;
    }
    onSignedIn();
  };

  // The iPhone number pad has no Enter key, so a complete code verifies by itself.
  const changeCode = (next: string) => {
    setCode(next);
    if (next.length === OTP_LENGTH) void confirmCode(next);
  };

  const backToEntry = () => {
    setStep('enter');
    setCode('');
    setError('');
  };

  const switchMethod = () => {
    setMethod(current => (current === 'email' ? 'phone' : 'email'));
    setError('');
  };

  return {
    method, step, phone, setPhone, email, setEmail, sentTo, code, error, busy,
    sendCode, resendCode, confirmCode, changeCode, backToEntry, switchMethod,
  };
}

export type SignInFlow = ReturnType<typeof useSignInFlow>;

/** The entry step's body: the email or phone form, then the switch link. */
export function SignInEntry({ flow }: { flow: SignInFlow }) {
  const styles = useThemeStyles(createStyles);
  return (
    <View style={styles.entry}>
      {flow.method === 'email' ? (
        <EmailSignInForm value={flow.email} onChange={flow.setEmail} onSubmit={() => void flow.sendCode()} error={flow.error} />
      ) : (
        <PhoneSignInForm value={flow.phone} onChange={flow.setPhone} onSubmit={() => void flow.sendCode()} error={flow.error} />
      )}
      <SignInMethodSwitch method={flow.method} onSwitch={flow.switchMethod} />
    </View>
  );
}

/** The code step's body: instruction, change link, the six cells, and for email the "nothing came?" way out. */
export function SignInCodeStep({ flow, showInstruction = true }: { flow: SignInFlow; showInstruction?: boolean }) {
  const styles = useThemeStyles(createStyles);
  const byEmail = flow.method === 'email';
  return (
    <View style={styles.otpStep}>
      {showInstruction ? (
        <Txt variant="bodySm" color="onSurfaceVariant">
          {`Enter the 6-digit code sent to ${flow.sentTo}`}
        </Txt>
      ) : null}
      <ChangeNumberLink onPress={flow.backToEntry} label={byEmail ? 'Change email' : 'Change number'} />
      <OtpCodeField
        code={flow.code}
        onChangeCode={flow.changeCode}
        onResend={flow.resendCode}
        onSubmit={() => void flow.confirmCode()}
        error={flow.error}
        autoFocus
        busy={flow.busy}
      />
      {byEmail ? (
        // The server answers the same for unknown addresses, so say plainly why a code may not come.
        <View style={styles.helper}>
          <Icon name="info" size={14} color="primaryAccent" />
          <Txt variant="caption" color="onSurfaceVariant" style={styles.helperText}>
            {'We only send the code if this email is linked to a Xana Plus account. Nothing came? Check spam, or '}
            <Txt
              variant="caption"
              color="primaryAccent"
              accessibilityRole="button"
              onPress={() => {
                flow.backToEntry();
                flow.switchMethod();
              }}
            >
              use your phone number
            </Txt>
            {'.'}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}


/**
 * Six single-character cells driven by one invisible but focusable field: taps
 * anywhere on the row land on it, typing advances the ringed cell, backspace
 * steps back. The ring and caret sit on the last digit entered — the state the
 * frame shows — and the resend countdown lives here too.
 */
export function OtpCodeField({
  code,
  onChangeCode,
  onResend,
  onSubmit,
  error,
  autoFocus,
  busy = false,
}: {
  code: string;
  onChangeCode: (next: string) => void;
  onResend: () => void;
  /** The keyboard's Enter / Done key: same as tapping verify. */
  onSubmit?: () => void;
  error?: string;
  autoFocus?: boolean;
  busy?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft(seconds => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const activeCell = Math.max(0, Math.min(code.length - 1, OTP_LENGTH - 1));
  const caret = focused && code.length < OTP_LENGTH;

  return (
    <View style={styles.otp}>
      <View style={styles.otpRow}>
        {Array.from({ length: OTP_LENGTH }, (_, index) => {
          const digit = code.charAt(index);
          return (
            <View key={index} style={[styles.cell, index === activeCell ? styles.cellActive : null]}>
              {digit ? <Txt variant="headlineLg">{digit}</Txt> : null}
              {caret && index === activeCell ? <View style={styles.caret} /> : null}
            </View>
          );
        })}
        <TextInput
          value={code}
          onChangeText={text => onChangeCode(text.replace(/\D/g, '').slice(0, OTP_LENGTH))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          selection={{ start: code.length, end: code.length }}
          keyboardType="number-pad"
          inputMode="numeric"
          returnKeyType="done"
          enterKeyHint="done"
          onSubmitEditing={onSubmit}
          autoComplete="sms-otp"
          textContentType="oneTimeCode"
          caretHidden
          autoFocus={autoFocus}
          accessibilityLabel={`${OTP_LENGTH}-digit verification code`}
          style={styles.hiddenField}
        />
      </View>

      {error ? <ErrorNote message={error} /> : null}

      <View style={styles.resendRow}>
        <Txt variant="bodySm" color="onSurfaceVariant">
          {"Didn't receive code?"}
        </Txt>
        {secondsLeft > 0 ? (
          <View style={styles.resendTimer}>
            <Icon name="refresh" size={13} color="primaryAccent" />
            <Txt variant="labelSm" tint={colors.primaryAccent}>
              {`Resend in ${formatCountdown(secondsLeft)}`}
            </Txt>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Resend verification code"
            disabled={busy}
            hitSlop={8}
            onPress={() => {
              setSecondsLeft(RESEND_SECONDS);
              onResend();
            }}
          >
            <Txt variant="labelSm" color="primaryAccent">
              Resend code
            </Txt>
          </Pressable>
        )}
      </View>

      <ProgressBar value={secondsLeft / RESEND_SECONDS} height={3} trackColor={colors.surfaceContainerHigh} fillColor={colors.primaryAccent} />
    </View>
  );
}

/** Legal line under the sheet's primary action. */
function TermsNote() {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  return (
    <Txt variant="caption" color="onSurfaceVariant" align="center" style={styles.terms}>
      {"By continuing, you agree to Xana Life's"}{' '}
      <Txt variant="caption" tint={colors.onSurface} style={styles.termsLink}>
        Terms of Service
      </Txt>
      {' & '}
      <Txt variant="caption" tint={colors.onSurface} style={styles.termsLink}>
        Privacy Policy
      </Txt>
      {'.'}
    </Txt>
  );
}

/**
 * Screen 6a — the checkout sign-in sheet. Mounted only while it is open, so
 * every visit starts on the phone step.
 */
export function AuthSheet({ visible, onClose, onSuccess }: { visible: boolean; onClose: () => void; onSuccess?: () => void }) {
  // Mounting the sheet per open keeps every open on a fresh phone step without a
  // state-syncing effect. Trade-off: a closing sheet disappears without the
  // kit's slide-down, which is why the auth sheet alone unmounts on close.
  if (!visible) return null;
  return <SignInSheet onClose={onClose} onSuccess={onSuccess} />;
}

/**
 * The sheet body for one open session: collects the phone number, requests a
 * real SMS code and verifies it without leaving the host screen; `onSuccess`
 * fires once the session is authenticated.
 */
function SignInSheet({ onClose, onSuccess }: { onClose: () => void; onSuccess?: () => void }) {
  const styles = useThemeStyles(createStyles);
  const flow = useSignInFlow(() => {
    onSuccess?.();
    onClose();
  });
  const entering = flow.step === 'enter';

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={entering ? 'Log in to complete your order' : flow.method === 'email' ? 'Check your email' : 'Verify your number'}
      description={entering ? undefined : `Enter the 6-digit code sent to ${flow.sentTo}`}
      footer={
        <View style={styles.footer}>
          {entering ? (
            <>
              <Button label="Continue" icon="chevron-right" size="lg" loading={flow.busy} onPress={flow.sendCode} />
              <TermsNote />
            </>
          ) : (
            <Button
              label="Verify & Continue"
              icon="shield"
              iconPosition="leading"
              size="lg"
              disabled={flow.code.length < OTP_LENGTH}
              loading={flow.busy}
              onPress={() => void flow.confirmCode()}
            />
          )}
        </View>
      }
    >
      {entering ? <SignInEntry flow={flow} /> : <SignInCodeStep flow={flow} showInstruction={false} />}
    </BottomSheet>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  form: { gap: spacing.md },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 52,
    paddingLeft: spacing.xs,
    paddingRight: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHighest,
    backgroundColor: colors.surface,
  },
  fieldFocused: { borderColor: colors.primaryAccent },
  emailField: { paddingLeft: spacing.lg },
  prefix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLow,
  },
  input: { flex: 1, padding: 0, fontSize: 14, lineHeight: 18, fontFamily: fonts.semibold, color: colors.onSurface },
  helper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  helperText: { flexShrink: 1 },
  channels: { gap: spacing.md },
  channelRow: { flexDirection: 'row', gap: spacing.md },
  channel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 48,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.outlineSoft30,
    backgroundColor: colors.surface,
  },
  channelSelected: { borderColor: colors.primaryAccent, backgroundColor: colors.mintSubtle },
  radio: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.primaryAccent, backgroundColor: colors.primaryContainer },
  error: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  errorText: { flexShrink: 1 },
  otp: { gap: spacing.md },
  otpRow: { position: 'relative', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  cell: {
    flex: 1,
    maxWidth: 50,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.surfaceContainerHighest,
    backgroundColor: colors.surface,
  },
  cellActive: { borderWidth: 2, borderColor: colors.primaryAccent },
  caret: { width: 2, height: 22, borderRadius: 1, backgroundColor: colors.primaryAccent },
  hiddenField: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0 },
  resendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  resendTimer: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  changeNumber: { alignSelf: 'flex-start' },
  otpStep: { gap: spacing.md },
  entry: { gap: spacing.xl },
  switchRow: { alignItems: 'center', gap: spacing.xxs },
  footer: { gap: spacing.lg },
  terms: { lineHeight: 18 },
  termsLink: { textDecorationLine: 'underline' },
});
