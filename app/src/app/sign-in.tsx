import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Body, Button, Heading, Kicker } from "@/components/ui";
import { signIn, signUp } from "@/lib/auth";
import { fonts, useColors } from "@/lib/theme";

const MIN_PASSWORD = 6;

export default function SignIn() {
  const colors = useColors();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "sign-in") await signIn(email.trim(), password);
      else if (!(await signUp(email.trim(), password))) {
        setNotice("Check your email and open the confirmation link, then sign in here.");
        setMode("sign-in");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = [styles.input, { borderColor: colors.rule, backgroundColor: colors.surface, color: colors.ink }];
  const signingUp = mode === "sign-up";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Kicker>Kitchen collection</Kicker>
          <Heading size={64} style={styles.title}>
            Recipe Book
          </Heading>
          <Body soft style={styles.lede}>
            Turn the cooking videos you love into your own cookbook. Paste a link from YouTube, Instagram, TikTok and
            more, or add screenshots, and we'll write the recipe for you.
          </Body>

          <View style={styles.form}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.inkSoft}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              accessibilityLabel="Email"
              style={inputStyle}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={signingUp ? `Choose a password (${MIN_PASSWORD}+ characters)` : "Password"}
              placeholderTextColor={colors.inkSoft}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={signingUp ? "new-password" : "current-password"}
              accessibilityLabel="Password"
              onSubmitEditing={submit}
              style={inputStyle}
            />
            {notice && <Body soft>{notice}</Body>}
            {error && <Body style={{ color: colors.berry }}>{error}</Body>}
            <Button
              label={signingUp ? "Create my cookbook" : "Open my cookbook"}
              onPress={submit}
              busy={busy}
              disabled={!email.includes("@") || password.length < MIN_PASSWORD}
            />
            <Button
              label={signingUp ? "I already have an account" : "New here? Create an account"}
              variant="quiet"
              onPress={() => {
                setMode(signingUp ? "sign-in" : "sign-up");
                setError(null);
              }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: 28, gap: 8 },
  title: { marginTop: 8 },
  lede: { marginTop: 12, maxWidth: 420 },
  form: { marginTop: 36, gap: 14 },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: fonts.body,
    fontSize: 17,
  },
});
