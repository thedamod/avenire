import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { Screen } from "../../components/Screen";
import { authClient } from "../../state/auth";

export function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const signIn = async () => {
    setPending(true);
    setError(undefined);
    try {
      const result = await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) setError(result.error.message ?? "Could not sign in");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in");
    } finally {
      setPending(false);
    }
  };

  const signInWithGoogle = async () => {
    setError(undefined);
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
      if (result.error) setError(result.error.message ?? "Could not continue with Google");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not continue with Google");
    }
  };

  return (
    <Screen>
      <View className="mt-16 gap-4">
        <Text className="mb-2 text-3xl font-bold text-foreground">Welcome to Avenire</Text>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          className="rounded-xl border border-border bg-card px-4 py-3 text-foreground"
        />
        <TextInput
          secureTextEntry
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          className="rounded-xl border border-border bg-card px-4 py-3 text-foreground"
        />
        {error ? <ErrorState message={error} /> : null}
        <Button onPress={() => void signIn()} busy={pending} disabled={!email.trim() || !password}>
          Sign in
        </Button>
        <Button onPress={() => void signInWithGoogle()} variant="secondary">
          Continue with Google
        </Button>
      </View>
    </Screen>
  );
}
