import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Body, Button, Heading } from "./ui";
import { useColors } from "@/lib/theme";

// In-app dialogs. Alert.alert does nothing on the web, so confirmations and
// errors go through this instead and look the same on every platform.

interface DialogRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string | null;
  resolve: (confirmed: boolean) => void;
}

let show: ((request: DialogRequest) => void) | null = null;

/** Asks the user to confirm. Resolves true when they choose confirmLabel. */
export function confirm(title: string, message: string | undefined, confirmLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) return resolve(false);
    show({ title, message, confirmLabel, cancelLabel: "Cancel", resolve });
  });
}

/** Shows a message with a single OK button. */
export function notify(title: string, message?: string): Promise<void> {
  return new Promise((resolve) => {
    if (!show) return resolve();
    show({ title, message, confirmLabel: "OK", cancelLabel: null, resolve: () => resolve() });
  });
}

export function DialogHost() {
  const colors = useColors();
  const [request, setRequest] = useState<DialogRequest | null>(null);

  useEffect(() => {
    show = setRequest;
    return () => {
      show = null;
    };
  }, []);

  function close(confirmed: boolean) {
    request?.resolve(confirmed);
    setRequest(null);
  }

  return (
    <Modal transparent visible={!!request} animationType="fade" onRequestClose={() => close(false)}>
      <Pressable style={styles.backdrop} onPress={() => close(false)} accessibilityLabel="Close">
        <Pressable style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.rule }]}>
          <Heading size={24}>{request?.title}</Heading>
          {request?.message && <Body soft>{request.message}</Body>}
          <View style={styles.actions}>
            {request?.cancelLabel && (
              <Button label={request.cancelLabel} variant="quiet" onPress={() => close(false)} />
            )}
            <Button label={request?.confirmLabel ?? "OK"} onPress={() => close(true)} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(20, 12, 9, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: { width: "100%", maxWidth: 380, borderRadius: 22, borderWidth: 1, padding: 24, gap: 12 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 },
});
