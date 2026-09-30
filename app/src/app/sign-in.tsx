import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Body, Button, Heading, Kicker } from "@/components/ui";
import { sendCode, verifyCode } from "@/lib/auth";
import { fonts, useColors } from "@/lib/theme";

export default function SignIn() {
  const colors = useColors();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (codeSent) await verifyCode(email.trim(), code.trim());
      else {
        await sendCode(email.trim());
        setCodeSent(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = [styles.input, { borderColor: colors.rule, backgroundColor: colors.surface, color: colors.ink }];

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
              editable={!codeSent}
              accessibilityLabel="Email"
              style={inputStyle}
            />
            {codeSent && (
              <>
                <Body soft>We sent a 6-digit code to {email.trim()}.</Body>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder="123456"
                  placeholderTextColor={colors.inkSoft}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  maxLength={6}
                  accessibilityLabel="Sign-in code"
                  style={[inputStyle, styles.code]}
                />
              </>
            )}
            {error && <Body style={{ color: colors.berry }}>{error}</Body>}
            <Button
              label={codeSent ? "Open my cookbook" : "Email me a sign-in code"}
              onPress={submit}
              busy={busy}
              disabled={codeSent ? code.trim().length < 6 : !email.includes("@")}
            />
            {codeSent && (
              <Button
                label="Use a different email"
                variant="quiet"
                onPress={() => {
                  setCodeSent(false);
                  setCode("");
                }}
              />
            )}
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
  code: { letterSpacing: 8, fontFamily: fonts.semibold, fontSize: 22 },
});
