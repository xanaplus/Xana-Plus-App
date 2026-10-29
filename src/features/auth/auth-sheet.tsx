import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { BottomSheet, Button, Icon, ProgressBar, Txt, type IconName } from '@/components/ui';
import type { FunctionError } from '@/lib/supabase';
import { isValidEmail, useSession, type SignInResult } from '@/store/session';
import { fonts, radius, spacing } from '@/theme';
import { useTheme, useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

/**
 * Screen 6a — Checkout (Login Sheet): the sign-in prompt opened from checkout,
 * plus the pieces the standalone `/login` route (Screen 11) reuses so both hosts
 * render the same form and the same verification step.
 *
 * The same as the website's account page (Roystone, 29 Oct 2026): email or
 * phone number and password first, "Create an account", and a code by SMS or
 * email for anyone without a password. Email only reaches an account that has
 * confirmed the address, so a new customer starts with their phone.
 */

/** Digits in the SMS code, in the design and in the `request-otp` Edge Function. */
export const OTP_LENGTH = 6;
/** The website's password rule. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
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
  invalid_credentials: 'The email, phone number or password is not right. If you have not set a password yet, get a code instead.',
  too_many_tries: 'Too many tries. Wait 15 minutes and try again, or get a code instead.',
  wrong_password: 'Your current password is not right.',
  weak_password: `Choose a stronger password of at least ${PASSWORD_MIN} characters.`,
  same_password: 'The new password must be different from the current one.',
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
  showChannels = true,
}: {
  value: PhoneInput;
  onChange: (next: PhoneInput) => void;
  /** The keyboard's Enter / Go key: same as tapping the send button. */
  onSubmit?: () => void;
  error?: string;
  /** The "Send code via" choice; off where SMS is the only way. */
  showChannels?: boolean;
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

      {showChannels ? <View style={styles.channels}>
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
      </View> : null}
    </View>
  );
}

/** Email field and helper line, for a code by email. */
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

/** A labelled text field in the form's style; `secure` adds a show / hide toggle. */
export function TextField({
  label,
  icon,
  hint,
  secure = false,
  ...input
}: { label: string; icon: IconName; hint?: string; secure?: boolean } & Omit<TextInputProps, 'style' | 'secureTextEntry'>) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);

  return (
    <View style={styles.textField}>
      <Txt variant="overline" color="onSurfaceVariant">
        {label}
      </Txt>
      <View style={[styles.field, styles.emailField, focused ? styles.fieldFocused : null]}>
        <Icon name={icon} size={18} color="onSurfaceVariant" />
        <TextInput
          placeholderTextColor={colors.outline}
          autoCorrect={false}
          accessibilityLabel={label}
          {...input}
          secureTextEntry={secure && !shown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.input}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={shown ? 'Hide password' : 'Show password'}
            hitSlop={8}
            onPress={() => setShown(value => !value)}
          >
            <Icon name="eye" size={18} color={shown ? 'primaryAccent' : 'onSurfaceVariant'} />
          </Pressable>
        ) : null}
      </View>
      {hint ? (
        <Txt variant="caption" color="onSurfaceVariant">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

/** "New here? Create an account": a line of text and the link that acts on it. */
function AltLink({ prompt, label, onPress }: { prompt?: string; label: string; onPress: () => void }) {
  const styles = useThemeStyles(createStyles);
  return (
    <View style={styles.switchRow}>
      {prompt ? (
        <Txt variant="bodySm" color="onSurfaceVariant" align="center">
          {prompt}
        </Txt>
      ) : null}
      <Pressable accessibilityRole="button" hitSlop={8} onPress={onPress}>
        <Txt variant="label" color="primaryAccent" align="center">
          {label}
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

/**
 * The screens, as on the website's account page: sign in with a password,
 * create an account, get a code instead, enter it, and (after a sign-up)
 * confirm the email.
 */
export type SignInView = 'password' | 'signup' | 'code' | 'verify' | 'confirmEmail';
export type CodeWay = 'sms' | 'email';

type SignupForm = { name: string; phone: PhoneInput; email: string; password: string };

const EMPTY_SIGNUP: SignupForm = { name: '', phone: EMPTY_PHONE_INPUT, email: '', password: '' };

/** The website's password rule, in its words. */
export function passwordProblem(password: string): string {
  if (!password) return 'Enter a password.';
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer.`;
  return '';
}

/**
 * The state behind both sign-in hosts: which screen, what was typed, and the
 * calls. `onSignedIn` runs once the customer is in and nothing is left to do.
 */
export function useSignInFlow(onSignedIn: () => void) {
  const session = useSession();
  const [view, setView] = useState<SignInView>('password');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [way, setWay] = useState<CodeWay>('sms');
  const [phone, setPhone] = useState<PhoneInput>(EMPTY_PHONE_INPUT);
  const [email, setEmail] = useState('');
  const [signup, setSignup] = useState<SignupForm>(EMPTY_SIGNUP);
  /** The code being entered is a sign-up's phone code. */
  const [signingUp, setSigningUp] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  /** Something a sign-up could not save, shown on the email step. */
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  /** A sign-up's phone code always goes by SMS. */
  const codeBy: CodeWay = signingUp ? 'sms' : way;

  const go = (next: SignInView) => {
    setView(next);
    setCode('');
    setError('');
  };

  const updateSignup = (patch: Partial<SignupForm>) => setSignup(current => ({ ...current, ...patch }));

  const signIn = async () => {
    if (busy) return;
    if (!login.trim()) return setError('Enter your email or phone number.');
    if (!password) return setError('Enter your password.');
    setBusy(true);
    const result = await session.signInWithPassword(login, password);
    setBusy(false);
    if (!result.ok) return setError(signInErrorMessage(result.error));
    setPassword('');
    onSignedIn();
  };

  const request = async () => {
    if (view === 'confirmEmail') return session.requestEmailConfirm(signup.email);
    if (signingUp) return session.requestOtp(phoneFromInput(signup.phone));
    return way === 'email' ? session.requestEmailCode(email) : session.requestOtp(phoneFromInput(phone));
  };

  const sendCode = async () => {
    if (busy) return;
    if (way === 'sms' && !isValidPhone(phone)) return setError(PHONE_INVALID_MESSAGE);
    setBusy(true);
    const result = await (way === 'email' ? session.requestEmailCode(email) : session.requestOtp(phoneFromInput(phone)));
    setBusy(false);
    if (!result.ok) return setError(signInErrorMessage(result.error));
    setSigningUp(false);
    setSentTo('email' in result ? result.email : formatPhoneDisplay(result.phone));
    go('verify');
  };

  const createAccount = async () => {
    if (busy) return;
    const problem = !signup.name.trim()
      ? 'Enter your full name.'
      : !isValidPhone(signup.phone)
        ? PHONE_INVALID_MESSAGE
        : !isValidEmail(signup.email)
          ? EMAIL_INVALID_MESSAGE
          : passwordProblem(signup.password);
    if (problem) return setError(problem);
    setBusy(true);
    const result = await session.requestOtp(phoneFromInput(signup.phone));
    setBusy(false);
    if (!result.ok) return setError(signInErrorMessage(result.error));
    setSigningUp(true);
    setNotice('');
    setSentTo(formatPhoneDisplay(result.phone));
    go('verify');
  };

  const resendCode = async () => {
    if (busy) return;
    setBusy(true);
    setCode('');
    const result = await request();
    setBusy(false);
    setError(result.ok ? '' : signInErrorMessage(result.error));
  };

  /** A sign-up whose phone is confirmed: send the email code, or finish if that can't happen. */
  const startEmailStep = async (unsaved: string[]) => {
    if (unsaved.length) setNotice(`We couldn't save ${unsaved.join(' and ')}. You can do it later in Profile.`);
    const result = await session.requestEmailConfirm(signup.email);
    if (result.ok) {
      setSentTo(result.email);
      go('confirmEmail');
      return;
    }
    // Already confirmed: nothing to ask. Any other failure leaves the "Add your email" prompt for later.
    if (result.error === 'already_confirmed') session.dismissEmailOffer();
    onSignedIn();
  };

  const confirmCode = async (entered = code) => {
    if (busy || entered.length < OTP_LENGTH) return;
    setBusy(true);
    if (view === 'confirmEmail') {
      const result = await session.confirmEmail(signup.email, entered);
      setBusy(false);
      if (!result.ok) {
        setError(signInErrorMessage(result.error));
        setCode('');
        return;
      }
      onSignedIn();
      return;
    }
    const result: SignInResult & { unsaved?: string[] } = codeBy === 'email'
      ? await session.verifyEmail(entered)
      : await session.verify(entered, signingUp ? { name: signup.name, email: signup.email, password: signup.password } : undefined);
    if (!result.ok) {
      setBusy(false);
      setError(signInErrorMessage(result.error));
      setCode('');
      return;
    }
    if (signingUp) await startEmailStep(result.unsaved ?? []);
    else onSignedIn();
    setBusy(false);
  };

  // The iPhone number pad has no Enter key, so a complete code verifies by itself.
  const changeCode = (next: string) => {
    setCode(next);
    if (next.length === OTP_LENGTH) void confirmCode(next);
  };

  /** "Skip for now" on the email step: the account is ready, the email waits for Profile. */
  const skipEmail = () => {
    session.dismissEmailOffer();
    onSignedIn();
  };

  /** One step back; false on the first screen, where the host closes instead. */
  const back = () => {
    if (view === 'password') return false;
    if (view === 'confirmEmail') skipEmail();
    else if (view === 'verify') go(signingUp ? 'signup' : 'code');
    else go('password');
    return true;
  };

  const chooseWay = (next: CodeWay) => {
    setWay(next);
    setError('');
  };

  const titles: Record<SignInView, string | null> = {
    password: null,
    signup: 'Create an account',
    code: 'Get a sign-in code',
    verify: codeBy === 'email' ? 'Check your email' : 'Verify your number',
    confirmEmail: 'Confirm your email',
  };

  const actions: Record<SignInView, { label: string; onPress: () => Promise<void>; disabled: boolean }> = {
    password: { label: 'Sign in', onPress: signIn, disabled: false },
    signup: { label: 'Create account', onPress: createAccount, disabled: false },
    code: { label: 'Send code', onPress: sendCode, disabled: false },
    verify: { label: 'Verify & Continue', onPress: () => confirmCode(), disabled: code.length < OTP_LENGTH },
    confirmEmail: { label: 'Confirm email', onPress: () => confirmCode(), disabled: code.length < OTP_LENGTH },
  };

  return {
    view, go, login, setLogin, password, setPassword, way, chooseWay, phone, setPhone, email, setEmail,
    signup, updateSignup, signingUp, codeBy, sentTo, code, error, notice, busy,
    /** The screen's own title; null on the first screen, which each host names. */
    title: titles[view],
    primary: actions[view],
    resendCode, changeCode, skipEmail, back,
  };
}

export type SignInFlow = ReturnType<typeof useSignInFlow>;

const WAYS: { value: CodeWay; label: string; icon: IconName }[] = [
  { value: 'sms', label: 'By SMS', icon: 'message' },
  { value: 'email', label: 'By email', icon: 'mail' },
];

/** The SMS / email choice on "Get a sign-in code". */
function WayChoice({ value, onChange }: { value: CodeWay; onChange: (next: CodeWay) => void }) {
  const styles = useThemeStyles(createStyles);
  return (
    <View style={styles.channelRow} accessibilityRole="radiogroup">
      {WAYS.map(option => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={[styles.channel, selected ? styles.channelSelected : null]}
          >
            <View style={[styles.radio, selected ? styles.radioSelected : null]}>
              {selected ? <Icon name="check" size={10} color="onPrimary" /> : null}
            </View>
            <Icon name={option.icon} size={15} color={selected ? 'primaryAccent' : 'onSurfaceVariant'} />
            <Txt variant="label" color={selected ? 'primaryAccent' : 'onSurfaceVariant'}>
              {option.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Whichever screen the flow is on. */
export function SignInBody({ flow }: { flow: SignInFlow }) {
  const styles = useThemeStyles(createStyles);
  const submit = () => void flow.primary.onPress();

  if (flow.view === 'password') {
    return (
      <View style={styles.entry}>
        <View style={styles.form}>
          <TextField
            label="Email or phone number"
            icon="user"
            value={flow.login}
            onChangeText={text => flow.setLogin(text.replace(/^\s+/, ''))}
            placeholder="you@example.com or 0712 345 678"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="username"
            textContentType="username"
            maxLength={254}
          />
          <TextField
            label="Password"
            icon="lock"
            secure
            value={flow.password}
            onChangeText={flow.setPassword}
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            enterKeyHint="go"
            onSubmitEditing={submit}
            maxLength={PASSWORD_MAX}
          />
          {flow.error ? <ErrorNote message={flow.error} /> : null}
        </View>
        <View style={styles.links}>
          <AltLink prompt="New here?" label="Create an account" onPress={() => flow.go('signup')} />
          <AltLink prompt="Forgot your password, or never set one?" label="Get a code by SMS or email" onPress={() => flow.go('code')} />
        </View>
      </View>
    );
  }

  if (flow.view === 'signup') {
    const { signup } = flow;
    return (
      <View style={styles.entry}>
        <Txt variant="bodySm" color="onSurfaceVariant">
          Your account is your phone number. We confirm it by SMS and your email with a code. Then you can sign in with either and your password.
        </Txt>
        <View style={styles.form}>
          <TextField
            label="Full name"
            icon="user"
            value={signup.name}
            onChangeText={name => flow.updateSignup({ name })}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            maxLength={60}
          />
          <PhoneSignInForm value={signup.phone} onChange={phone => flow.updateSignup({ phone })} showChannels={false} />
          <TextField
            label="Email"
            icon="mail"
            hint="We email you a code to confirm it."
            value={signup.email}
            onChangeText={text => flow.updateSignup({ email: text.replace(/\s/g, '') })}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            maxLength={254}
          />
          <TextField
            label="Password"
            icon="lock"
            secure
            hint={`At least ${PASSWORD_MIN} characters.`}
            value={signup.password}
            onChangeText={password => flow.updateSignup({ password })}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            enterKeyHint="go"
            onSubmitEditing={submit}
            maxLength={PASSWORD_MAX}
          />
          {flow.error ? <ErrorNote message={flow.error} /> : null}
        </View>
        <AltLink prompt="Already have an account?" label="Sign in" onPress={() => flow.go('password')} />
      </View>
    );
  }

  if (flow.view === 'code') {
    const byEmail = flow.way === 'email';
    return (
      <View style={styles.entry}>
        <WayChoice value={flow.way} onChange={flow.chooseWay} />
        <Txt variant="bodySm" color="onSurfaceVariant">
          {byEmail
            ? 'Enter the email confirmed on your account and we will email you a 6-digit code. New here? Start with a code by SMS.'
            : 'Enter your phone number and we will text you a 6-digit code.'}
        </Txt>
        {byEmail ? (
          <EmailSignInForm value={flow.email} onChange={flow.setEmail} onSubmit={submit} error={flow.error} />
        ) : (
          <PhoneSignInForm value={flow.phone} onChange={flow.setPhone} onSubmit={submit} error={flow.error} showChannels={false} />
        )}
        <AltLink prompt="Have a password?" label="Sign in with your password" onPress={() => flow.go('password')} />
      </View>
    );
  }

  const confirming = flow.view === 'confirmEmail';
  return (
    <View style={styles.otpStep}>
      {flow.signingUp ? (
        <Txt variant="overline" color="primaryAccent">
          {confirming ? 'Step 2 of 2: your email' : 'Step 1 of 2: your phone'}
        </Txt>
      ) : null}
      {flow.notice ? <ErrorNote message={flow.notice} /> : null}
      <Txt variant="bodySm" color="onSurfaceVariant">
        {confirming
          ? `We emailed a 6-digit code to ${flow.sentTo}. It expires in 10 minutes. Check your spam folder too.`
          : `Enter the 6-digit code sent to ${flow.sentTo}`}
      </Txt>
      {confirming ? null : (
        <ChangeNumberLink
          onPress={flow.back}
          label={flow.signingUp ? 'Change your details' : flow.codeBy === 'email' ? 'Change email' : 'Change number'}
        />
      )}
      <OtpCodeField
        key={flow.view}
        code={flow.code}
        onChangeCode={flow.changeCode}
        onResend={flow.resendCode}
        onSubmit={submit}
        error={flow.error}
        autoFocus
        busy={flow.busy}
      />
      {confirming ? (
        <AltLink prompt="You can confirm it later in Profile." label="Skip for now" onPress={flow.skipEmail} />
      ) : flow.codeBy === 'email' ? (
        // The server answers the same for unknown addresses, so say plainly why a code may not come.
        <View style={styles.helper}>
          <Icon name="info" size={14} color="primaryAccent" />
          <Txt variant="caption" color="onSurfaceVariant" style={styles.helperText}>
            {'We only send the code if this email is confirmed on a Xana Plus account. Nothing came? Check spam, or '}
            <Txt
              variant="caption"
              color="primaryAccent"
              accessibilityRole="button"
              onPress={() => {
                flow.chooseWay('sms');
                flow.go('code');
              }}
            >
              get a code by SMS
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
 * every visit starts on the sign-in screen.
 */
export function AuthSheet({ visible, onClose, onSuccess }: { visible: boolean; onClose: () => void; onSuccess?: () => void }) {
  // Mounting the sheet per open keeps every open on a fresh sign-in screen without a
  // state-syncing effect. Trade-off: a closing sheet disappears without the
  // kit's slide-down, which is why the auth sheet alone unmounts on close.
  if (!visible) return null;
  return <SignInSheet onClose={onClose} onSuccess={onSuccess} />;
}

/**
 * The sheet body for one open session: every sign-in screen, without leaving
 * the host screen; `onSuccess` fires once the customer is in.
 */
function SignInSheet({ onClose, onSuccess }: { onClose: () => void; onSuccess?: () => void }) {
  const styles = useThemeStyles(createStyles);
  const flow = useSignInFlow(() => {
    onSuccess?.();
    onClose();
  });
  const first = flow.view === 'password' || flow.view === 'signup';

  return (
    <BottomSheet
      visible
      scrollable
      // Closing on the email step leaves a signed-in customer: the same as "Skip for now".
      onClose={flow.view === 'confirmEmail' ? flow.skipEmail : onClose}
      title={flow.title ?? 'Log in to complete your order'}
      footer={
        <View style={styles.footer}>
          <Button
            label={flow.primary.label}
            icon={first ? 'chevron-right' : flow.view === 'code' ? undefined : 'shield'}
            iconPosition={first ? 'trailing' : 'leading'}
            size="lg"
            disabled={flow.primary.disabled}
            loading={flow.busy}
            onPress={() => void flow.primary.onPress()}
          />
          {first ? <TermsNote /> : null}
        </View>
      }
    >
      <SignInBody flow={flow} />
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
  textField: { gap: spacing.sm },
  links: { gap: spacing.lg },
  switchRow: { alignItems: 'center', gap: spacing.xxs },
  footer: { gap: spacing.lg },
  terms: { lineHeight: 18 },
  termsLink: { textDecorationLine: 'underline' },
});
