import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import {
  Button,
  Divider,
  ErrorState,
  Input,
  Pressable,
  Screen,
  ScrollFade,
  Text,
  errorMessage,
} from "../../ui";
import { apiUrl, authClient } from "../../state/auth";
import { colors } from "../../theme/tokens";
import { Wordmark } from "../onboarding/Wordmark";

export function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<"email" | "google" | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const running = useRef(false);

  const signIn = async () => {
    if (running.current || !email.trim() || !password) return;
    running.current = true;
    setPending("email");
    setError(undefined);
    try {
      const result = await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) setError(result.error.message ?? "Could not sign in");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      running.current = false;
      setPending(null);
    }
  };

  const signInWithGoogle = async () => {
    if (running.current) return;
    running.current = true;
    setPending("google");
    setError(undefined);
    try {
      // The configured Better Auth Expo plugin converts this callback to the app
      // scheme, owns openAuthSessionAsync, and persists the returned session cookie.
      const result = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
      if (result.error) setError(result.error.message ?? "Could not continue with Google");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      running.current = false;
      setPending(null);
    }
  };

  const openPage = async (url: string) => {
    setError(undefined);
    try {
      if (Platform.OS === "web") await Linking.openURL(url);
      else await WebBrowser.openBrowserAsync(url);
    } catch (cause) {
      setError(`Couldn’t open this page: ${errorMessage(cause)}`);
    }
  };

  const authPage = (path: string) => new URL(path, apiUrl).toString();

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollFade top={scrolled}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.page}
            onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 0)}
            scrollEventThrottle={100}
          >
            <View style={styles.content}>
              <View style={styles.brand}>
                <Wordmark width={220} />
              </View>
              <Text variant="title" accessibilityRole="header" style={{ marginBottom: 28 }}>
                Sign in
              </Text>
              <View style={styles.form}>
                <Input
                  label="Email"
                  accessibilityLabel="Email"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  editable={pending === null}
                  placeholder="you@university.edu"
                  style={styles.input}
                />
                <View>
                  <Input
                    label="Password"
                    accessibilityLabel="Password"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="current-password"
                    textContentType="password"
                    value={password}
                    onChangeText={setPassword}
                    editable={pending === null}
                    placeholder="Your password"
                    returnKeyType="go"
                    onSubmitEditing={() => void signIn()}
                    style={[styles.input, { paddingRight: 60 }]}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                    accessibilityState={{ selected: showPassword }}
                    hitSlop={4}
                    onPress={() => setShowPassword((visible) => !visible)}
                    style={styles.reveal}
                  >
                    <Text variant="meta" color="fg-2">
                      {showPassword ? "Hide" : "Show"}
                    </Text>
                  </Pressable>
                </View>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Forgot password?"
                  onPress={() => void openPage(authPage("/forgot-password"))}
                  disabled={pending !== null}
                  style={styles.forgot}
                >
                  <Text>Forgot password?</Text>
                </Pressable>
                {error ? <ErrorState message={error} /> : null}
                <Button
                  accessibilityLabel="Sign in"
                  hitSlop={4}
                  onPress={() => void signIn()}
                  busy={pending === "email"}
                  disabled={pending !== null || !email.trim() || !password}
                  style={styles.submit}
                >
                  Sign in
                </Button>
              </View>
              <View style={styles.divider}>
                <View style={styles.flex}>
                  <Divider />
                </View>
                <Text variant="meta">or</Text>
                <View style={styles.flex}>
                  <Divider />
                </View>
              </View>
              <Button
                accessibilityLabel="Continue with Google"
                hitSlop={4}
                onPress={() => void signInWithGoogle()}
                variant="secondary"
                busy={pending === "google"}
                disabled={pending !== null}
                style={styles.google}
              >
                Continue with Google
              </Button>
              <View style={styles.account}>
                <Text>New to Avenire?</Text>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Create an account"
                  disabled={pending !== null}
                  onPress={() => void openPage(authPage("/sign-up"))}
                  style={styles.accountLink}
                >
                  <Text color="fg">Create an account</Text>
                </Pressable>
              </View>
              <Text variant="meta" style={styles.termsCopy}>
                By continuing, you agree to our
              </Text>
              <View style={styles.terms}>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Terms of Service"
                  onPress={() => void openPage("https://avenire.space/terms")}
                  style={styles.legalLink}
                >
                  <Text variant="meta" color="fg-2">
                    Terms of Service
                  </Text>
                </Pressable>
                <Text variant="meta">and</Text>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Privacy Policy"
                  onPress={() => void openPage("https://avenire.space/privacy")}
                  style={styles.legalLink}
                >
                  <Text variant="meta" color="fg-2">
                    Privacy Policy
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </ScrollFade>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 24,
    alignItems: "center",
  },
  content: { width: "100%", maxWidth: 360 },
  brand: { alignItems: "center", marginBottom: 44 },
  form: { gap: 18 },
  input: { height: 36, fontSize: 16 },
  reveal: {
    position: "absolute",
    right: 0,
    bottom: -4,
    height: 44,
    width: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  forgot: {
    alignSelf: "flex-end",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
    marginTop: -8,
  },
  submit: { height: 36, width: "100%", borderRadius: 8 },
  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 24 },
  google: {
    height: 36,
    borderRadius: 8,
    backgroundColor: "transparent",
    borderColor: colors["line-2"],
  },
  account: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 16,
    flexWrap: "wrap",
  },
  accountLink: { minHeight: 44, minWidth: 44, justifyContent: "center" },
  termsCopy: { textAlign: "center", marginTop: 12 },
  terms: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  legalLink: { minHeight: 44, minWidth: 44, justifyContent: "center" },
});
