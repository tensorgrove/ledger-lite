import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StatusBar as RNStatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { balanceOf, formatCents, parseAmountToCents, type Ledger, type LedgerEntry } from './src/lib/ledger';
import { fetchLedger, newIdempotencyKey, postEntry, type ApiError } from './src/lib/api';
import { colors, space } from './src/theme';

// Sent with every request so the server can enforce a minimum supported build.
// In a real app, read this from expo-application (nativeBuildVersion).
const CLIENT_BUILD = 1;

type Mode = 'deposit' | 'transfer_out';

export default function App() {
  const [ledger, setLedger] = useState<Ledger>({ entries: [] });
  const [mode, setMode] = useState<Mode>('deposit');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [flaky, setFlaky] = useState(true);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const refresh = useCallback(async () => setLedger(await fetchLedger()), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const submit = async () => {
    const cents = parseAmountToCents(amount);
    if (cents === null) {
      setLog(['Enter an amount like 25 or 12.50']);
      return;
    }

    // One key per user action — reused across every retry of that action.
    const idempotencyKey = newIdempotencyKey();
    const lines: string[] = [`Key ${idempotencyKey}`];
    setBusy(true);
    setLog(lines);

    try {
      const res = await postEntry(
        { kind: mode, amount: mode === 'deposit' ? cents : -cents, note: note.trim() || (mode === 'deposit' ? 'Deposit' : 'Transfer') },
        {
          idempotencyKey,
          clientBuild: CLIENT_BUILD,
          flakiness: flaky ? 0.6 : 0,
          onAttempt: (n, err) => {
            lines.push(err ? `Attempt ${n}: ${err.code}` : `Attempt ${n}: OK`);
            setLog([...lines]);
          },
        },
      );
      lines.push(res.replayed ? 'Server replayed the original entry (no double charge).' : 'Entry applied once.');
      setAmount('');
      setNote('');
    } catch (err) {
      const e = err as ApiError;
      lines.push(`${e.code}: ${e.message} (${e.requestId})`);
    } finally {
      setLog([...lines]);
      setBusy(false);
      refresh();
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.caption}>Available balance</Text>
        <Text style={styles.balance}>{formatCents(balanceOf(ledger))}</Text>
        <Text style={styles.subtle}>Derived from {ledger.entries.length} ledger entries</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.segment}>
          {(['deposit', 'transfer_out'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[styles.segmentItem, mode === m && styles.segmentActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === m }}
            >
              <Text style={[styles.segmentText, mode === m && styles.segmentTextActive]}>
                {m === 'deposit' ? 'Deposit' : 'Send'}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="Amount (e.g. 25.00)"
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          style={styles.input}
        />
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Note (optional)"
          placeholderTextColor={colors.muted}
          style={styles.input}
          maxLength={40}
        />

        <View style={styles.row}>
          <Text style={styles.label}>Simulate flaky network</Text>
          <Switch value={flaky} onValueChange={setFlaky} />
        </View>

        <Pressable onPress={submit} disabled={busy} style={[styles.button, busy && { opacity: 0.6 }]}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{mode === 'deposit' ? 'Deposit' : 'Send'}</Text>}
        </Pressable>

        {log.length > 0 && (
          <View style={styles.log}>
            {log.map((l, i) => (
              <Text key={i} style={styles.logText}>
                {l}
              </Text>
            ))}
          </View>
        )}
      </View>

      <FlatList
        data={ledger.entries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingBottom: space.xl }}
        ListEmptyComponent={<Text style={[styles.subtle, { textAlign: 'center', marginTop: space.lg }]}>No entries yet</Text>}
        renderItem={({ item }) => <EntryRow entry={item} />}
      />

      <Text style={styles.footer}>API v1 · build {CLIENT_BUILD}</Text>
    </View>
  );
}

function EntryRow({ entry }: { entry: LedgerEntry }) {
  const credit = entry.amount > 0;
  return (
    <View style={styles.entry}>
      <View style={{ flex: 1 }}>
        <Text style={styles.entryNote}>{entry.note}</Text>
        <Text style={styles.subtleDark}>{new Date(entry.createdAt).toLocaleString()}</Text>
      </View>
      <Text style={[styles.entryAmount, { color: credit ? colors.credit : colors.debit }]}>
        {credit ? '+' : ''}
        {formatCents(entry.amount)}
      </Text>
    </View>
  );
}

const topInset = Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) : 54;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.brand, paddingTop: topInset + space.md, paddingBottom: space.xl, paddingHorizontal: space.lg },
  caption: { color: '#ffffffb3', fontSize: 14 },
  balance: { color: '#fff', fontSize: 40, fontWeight: '700', marginVertical: space.xs },
  subtle: { color: '#ffffffb3', fontSize: 12 },
  subtleDark: { color: colors.muted, fontSize: 12, marginTop: 2 },
  card: { backgroundColor: colors.surface, margin: space.lg, marginTop: -space.lg, borderRadius: 16, padding: space.lg, gap: space.md },
  segment: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 10, padding: 4 },
  segmentItem: { flex: 1, paddingVertical: space.sm, alignItems: 'center', borderRadius: 8 },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { color: colors.muted, fontWeight: '600' },
  segmentTextActive: { color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: space.md, fontSize: 16, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: colors.text },
  button: { backgroundColor: colors.brand, borderRadius: 12, paddingVertical: space.md, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  log: { backgroundColor: colors.bg, borderRadius: 10, padding: space.sm },
  logText: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 11, color: colors.text },
  entry: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, marginHorizontal: space.lg, marginBottom: space.sm, padding: space.md, borderRadius: 12 },
  entryNote: { color: colors.text, fontWeight: '500' },
  entryAmount: { fontWeight: '700', fontSize: 16 },
  footer: { textAlign: 'center', color: colors.muted, fontSize: 11, paddingBottom: space.lg },
});
