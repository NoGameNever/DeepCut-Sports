import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { api, AdminQuestion, QuestionBankSummary, QuestionCampaign } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme/theme";

const STATUSES = ["draft", "flagged", "approved", "rejected", "archived"];
const SPORTS = ["basketball", "nfl", "baseball", "hockey", "soccer", "golf", "videogames"];
const DIFFICULTIES = ["easy", "medium", "hard", "deepcut"];

function pct(question: AdminQuestion) {
  if (!question.answer_count) return "—";
  return `${Math.round(((question.correct_count || 0) / question.answer_count) * 100)}%`;
}

function Pill({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label.toUpperCase()}</Text>
    </Pressable>
  );
}

export default function QuestionBankAdmin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [tab, setTab] = useState<"review" | "campaigns">("review");
  const [status, setStatus] = useState("draft");
  const [summary, setSummary] = useState<QuestionBankSummary | null>(null);
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [campaigns, setCampaigns] = useState<QuestionCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [editing, setEditing] = useState<AdminQuestion | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [editSource, setEditSource] = useState("");
  const [editSourceUrl, setEditSourceUrl] = useState("");
  const [campaignName, setCampaignName] = useState("DeepCut 500");
  const [campaignSport, setCampaignSport] = useState("basketball");
  const [campaignDifficulty, setCampaignDifficulty] = useState("deepcut");
  const [campaignCount, setCampaignCount] = useState("500");
  const [campaignSubcategory, setCampaignSubcategory] = useState("");

  const loadSummary = useCallback(async () => {
    const data = await api.questionBankSummary();
    setSummary(data);
    return data;
  }, []);

  const loadQuestions = useCallback(async () => {
    const data = await api.adminQuestions({ status, limit: 100 });
    setQuestions(data.items);
  }, [status]);

  const loadCampaigns = useCallback(async () => {
    setCampaigns(await api.questionCampaigns());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setForbidden(false);
      await Promise.all([loadSummary(), loadQuestions(), loadCampaigns()]);
    } catch (e: any) {
      if (e?.status === 403) setForbidden(true);
      else toast.show(e?.detail || "Couldn't load Question Bank", "error");
    } finally {
      setLoading(false);
    }
  }, [loadSummary, loadQuestions, loadCampaigns, toast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!loading && !forbidden) void loadQuestions().catch(() => {});
    // status-only refresh; full load is handled above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const openEdit = (question: AdminQuestion) => {
    setEditing(question);
    setEditQuestion(question.question || "");
    setEditAnswer(question.correct_answer || "");
    setEditSource(question.source || "");
    setEditSourceUrl(question.source_url || "");
  };

  const saveEdit = async () => {
    if (!editing) return;
    setWorkingId(editing.id);
    try {
      await api.patchAdminQuestion(editing.id, {
        question: editQuestion.trim(),
        correct_answer: editAnswer.trim(),
        source: editSource.trim(),
        source_url: editSourceUrl.trim(),
      });
      setEditing(null);
      toast.show("Question updated", "success");
      await loadQuestions();
    } catch (e: any) {
      toast.show(e?.detail || "Couldn't save question", "error");
    } finally {
      setWorkingId(null);
    }
  };

  const review = async (question: AdminQuestion, decision: string) => {
    setWorkingId(question.id);
    try {
      await api.reviewAdminQuestion(question.id, {
        status: decision,
        verification_status: decision === "approved" ? "verified" : undefined,
      });
      toast.show(decision === "approved" ? "Question approved" : `Question ${decision}`, "success");
      await Promise.all([loadSummary(), loadQuestions()]);
    } catch (e: any) {
      toast.show(e?.detail || "Review action failed", "error");
    } finally {
      setWorkingId(null);
    }
  };

  const markVerified = async (question: AdminQuestion) => {
    setWorkingId(question.id);
    try {
      await api.patchAdminQuestion(question.id, { verification_status: "verified" });
      toast.show("Marked verified", "success");
      await loadQuestions();
    } catch (e: any) {
      toast.show(e?.detail || "Couldn't verify question", "error");
    } finally {
      setWorkingId(null);
    }
  };

  const createCampaign = async () => {
    const target = parseInt(campaignCount, 10);
    if (!campaignName.trim() || !Number.isFinite(target) || target < 1) {
      toast.show("Enter a campaign name and target", "error");
      return;
    }
    setWorkingId("new-campaign");
    try {
      await api.createQuestionCampaign({
        name: campaignName.trim(),
        sport: campaignSport,
        target_count: target,
        difficulty: campaignDifficulty,
        subcategory: campaignSubcategory.trim() || undefined,
        tags: ["bulk_campaign"],
      });
      toast.show("Campaign created", "success");
      await loadCampaigns();
      setTab("campaigns");
    } catch (e: any) {
      toast.show(e?.detail || "Couldn't create campaign", "error");
    } finally {
      setWorkingId(null);
    }
  };

  const generateNext = async (campaign: QuestionCampaign) => {
    setWorkingId(campaign.id);
    try {
      const result = await api.generateQuestionCampaignBatch(campaign.id, 25);
      toast.show(`Generated ${result.batch.generated} drafts`, "success");
      await Promise.all([loadCampaigns(), loadSummary()]);
    } catch (e: any) {
      toast.show(e?.detail || "Generation failed", "error");
    } finally {
      setWorkingId(null);
    }
  };

  const backfill = async () => {
    setWorkingId("backfill");
    try {
      const dry = await api.backfillQuestionMetadata(true);
      const total = Object.values(dry.would_update || {}).reduce((sum: number, value: any) => sum + Number(value || 0), 0);
      if (total > 0) await api.backfillQuestionMetadata(false);
      toast.show(total ? "Legacy metadata normalized" : "Metadata already current", "success");
      await loadSummary();
    } catch (e: any) {
      toast.show(e?.detail || "Backfill failed", "error");
    } finally {
      setWorkingId(null);
    }
  };

  const reviewedCount = useMemo(
    () => (summary?.statuses.approved || 0) + (summary?.statuses.rejected || 0) + (summary?.statuses.archived || 0),
    [summary]
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
        <Text style={styles.muted}>Loading Question Bank…</Text>
      </View>
    );
  }

  if (forbidden) {
    return (
      <View style={styles.centered}>
        <Ionicons name="lock-closed" size={44} color={colors.error} />
        <Text style={styles.title}>ADMIN ACCESS REQUIRED</Text>
        <Text style={styles.muted}>This account is not listed in ADMIN_EMAILS or ADMIN_USER_IDS.</Text>
        <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
          <Text style={styles.primaryText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="question-bank-admin">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>DEEPCUT ADMIN</Text>
          <Text style={styles.title}>QUESTION BANK</Text>
        </View>
        <Pressable onPress={() => void load()} style={styles.iconBtn}>
          <Ionicons name="refresh" size={21} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryGrid}>
          <View style={styles.statCard}><Text style={styles.statValue}>{summary?.total || 0}</Text><Text style={styles.statLabel}>TOTAL</Text></View>
          <View style={styles.statCard}><Text style={styles.statValue}>{summary?.statuses.approved || 0}</Text><Text style={styles.statLabel}>APPROVED</Text></View>
          <View style={styles.statCard}><Text style={styles.statValue}>{summary?.statuses.draft || 0}</Text><Text style={styles.statLabel}>DRAFT</Text></View>
          <View style={styles.statCard}><Text style={styles.statValue}>{summary?.statuses.flagged || 0}</Text><Text style={styles.statLabel}>FLAGGED</Text></View>
        </View>
        <Text style={styles.smallLine}>{reviewedCount.toLocaleString()} reviewed · {summary?.open_reports || 0} open reports</Text>

        <View style={styles.tabRow}>
          <Pressable style={[styles.tabBtn, tab === "review" && styles.tabActive]} onPress={() => setTab("review")}>
            <Text style={[styles.tabText, tab === "review" && styles.tabTextActive]}>REVIEW QUEUE</Text>
          </Pressable>
          <Pressable style={[styles.tabBtn, tab === "campaigns" && styles.tabActive]} onPress={() => setTab("campaigns")}>
            <Text style={[styles.tabText, tab === "campaigns" && styles.tabTextActive]}>CAMPAIGNS</Text>
          </Pressable>
        </View>

        {tab === "review" ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
              {STATUSES.map((item) => <Pill key={item} label={`${item} ${summary?.statuses[item] || 0}`} active={status === item} onPress={() => setStatus(item)} />)}
            </ScrollView>

            <Pressable style={styles.secondaryBtn} onPress={backfill} disabled={workingId === "backfill"}>
              {workingId === "backfill" ? <ActivityIndicator color={colors.onSurface} /> : <Ionicons name="construct-outline" size={18} color={colors.onSurface} />}
              <Text style={styles.secondaryText}>Normalize legacy metadata</Text>
            </Pressable>

            {questions.length === 0 ? <Text style={styles.empty}>No questions in this queue.</Text> : null}
            {questions.map((question) => {
              const busy = workingId === question.id;
              return (
                <View key={question.id} style={styles.questionCard}>
                  <View style={styles.metaRow}>
                    <Text style={styles.meta}>{question.sport?.toUpperCase()} · {question.difficulty?.toUpperCase()}</Text>
                    <Text style={[styles.verify, question.verification_status === "verified" && styles.verified]}>
                      {(question.verification_status || "UNVERIFIED").toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.question}>{question.question}</Text>
                  <Text style={styles.answer}>✓ {question.correct_answer}</Text>
                  <Text style={styles.source}>Source: {question.source || "Missing"}</Text>
                  <Text style={styles.telemetry}>
                    {question.answer_count || 0} answers · {pct(question)} correct · {question.report_count || 0} reports · confidence {question.factual_confidence == null ? "—" : Math.round(question.factual_confidence * 100) + "%"}
                  </Text>
                  <View style={styles.actionRow}>
                    <Pressable style={styles.miniBtn} onPress={() => openEdit(question)} disabled={busy}><Text style={styles.miniText}>Edit</Text></Pressable>
                    {question.verification_status !== "verified" && (
                      <Pressable style={styles.miniBtn} onPress={() => void markVerified(question)} disabled={busy}><Text style={styles.miniText}>Verify</Text></Pressable>
                    )}
                    {question.status !== "approved" && (
                      <Pressable style={[styles.miniBtn, styles.approveBtn]} onPress={() => void review(question, "approved")} disabled={busy}>
                        <Text style={styles.approveText}>Approve</Text>
                      </Pressable>
                    )}
                    <Pressable style={[styles.miniBtn, styles.rejectBtn]} onPress={() => void review(question, "rejected")} disabled={busy}>
                      <Text style={styles.rejectText}>Reject</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </>
        ) : (
          <>
            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>NEW GENERATION CAMPAIGN</Text>
              <TextInput style={styles.input} value={campaignName} onChangeText={setCampaignName} placeholder="Campaign name" placeholderTextColor={colors.onSurfaceTertiary} />
              <TextInput style={styles.input} value={campaignCount} onChangeText={setCampaignCount} keyboardType="number-pad" placeholder="Target questions" placeholderTextColor={colors.onSurfaceTertiary} />
              <TextInput style={styles.input} value={campaignSubcategory} onChangeText={setCampaignSubcategory} placeholder="Subcategory, optional" placeholderTextColor={colors.onSurfaceTertiary} />
              <Text style={styles.fieldLabel}>SPORT</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
                {SPORTS.map((item) => <Pill key={item} label={item} active={campaignSport === item} onPress={() => setCampaignSport(item)} />)}
              </ScrollView>
              <Text style={styles.fieldLabel}>DIFFICULTY</Text>
              <View style={styles.wrapRow}>
                {DIFFICULTIES.map((item) => <Pill key={item} label={item} active={campaignDifficulty === item} onPress={() => setCampaignDifficulty(item)} />)}
              </View>
              <Pressable style={styles.primaryBtn} onPress={createCampaign} disabled={workingId === "new-campaign"}>
                {workingId === "new-campaign" ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Ionicons name="add-circle" size={19} color={colors.onBrandPrimary} />}
                <Text style={styles.primaryText}>Create Campaign</Text>
              </Pressable>
            </View>

            {campaigns.map((campaign) => {
              const progress = campaign.target_count ? Math.min(100, Math.round((campaign.generated_count / campaign.target_count) * 100)) : 0;
              return (
                <View key={campaign.id} style={styles.campaignCard}>
                  <View style={styles.metaRow}>
                    <Text style={styles.campaignName}>{campaign.name}</Text>
                    <Text style={styles.meta}>{campaign.status.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.source}>{campaign.sport.toUpperCase()} · {campaign.generated_count}/{campaign.target_count} generated</Text>
                  <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
                  <Text style={styles.telemetry}>{campaign.imported_count} imported · {campaign.duplicate_count} duplicates · {campaign.rejected_count} rejected</Text>
                  {campaign.status !== "complete" && (
                    <Pressable style={styles.primaryBtn} onPress={() => void generateNext(campaign)} disabled={workingId === campaign.id}>
                      {workingId === campaign.id ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Ionicons name="sparkles" size={18} color={colors.onBrandPrimary} />}
                      <Text style={styles.primaryText}>Generate Next 25</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {editing && (
        <View style={styles.editOverlay}>
          <ScrollView style={styles.editCard} contentContainerStyle={{ gap: spacing.md }}>
            <View style={styles.metaRow}>
              <Text style={styles.sectionTitle}>EDIT QUESTION</Text>
              <Pressable onPress={() => setEditing(null)}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
            </View>
            <Text style={styles.fieldLabel}>QUESTION</Text>
            <TextInput style={[styles.input, styles.multiInput]} multiline value={editQuestion} onChangeText={setEditQuestion} />
            <Text style={styles.fieldLabel}>CORRECT ANSWER</Text>
            <TextInput style={styles.input} value={editAnswer} onChangeText={setEditAnswer} />
            <Text style={styles.fieldLabel}>VERIFICATION SOURCE</Text>
            <TextInput style={[styles.input, styles.multiInput]} multiline value={editSource} onChangeText={setEditSource} />
            <Text style={styles.fieldLabel}>SOURCE URL, OPTIONAL</Text>
            <TextInput style={styles.input} autoCapitalize="none" value={editSourceUrl} onChangeText={setEditSourceUrl} />
            <Pressable style={styles.primaryBtn} onPress={saveEdit} disabled={workingId === editing.id}>
              {workingId === editing.id ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Ionicons name="save" size={18} color={colors.onBrandPrimary} />}
              <Text style={styles.primaryText}>Save Changes</Text>
            </Pressable>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  iconBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: colors.brandPrimary, fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 1.5 },
  title: { color: colors.onSurface, fontFamily: fonts.poster, fontSize: fontSize["2xl"], letterSpacing: 0.8 },
  muted: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.base, textAlign: "center" },
  content: { padding: spacing.lg, paddingBottom: 100, gap: spacing.lg },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  statCard: { flexGrow: 1, minWidth: "22%", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 2, borderColor: colors.ink, padding: spacing.md, alignItems: "center" },
  statValue: { color: colors.brandPrimary, fontFamily: fonts.displayBold, fontSize: 26 },
  statLabel: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodySemiBold, fontSize: 9, letterSpacing: 0.8 },
  smallLine: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.sm },
  tabRow: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: 4 },
  tabBtn: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.surfaceInverse },
  tabText: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm },
  tabTextActive: { color: colors.onSurfaceInverse },
  pillRow: { gap: spacing.sm, paddingVertical: 2 },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  pill: { borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  pillActive: { backgroundColor: colors.brandPrimary, borderColor: colors.ink },
  pillText: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodySemiBold, fontSize: 10 },
  pillTextActive: { color: colors.onBrandPrimary },
  questionCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 2, borderColor: colors.ink, padding: spacing.lg, gap: spacing.sm },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  meta: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm },
  verify: { color: colors.warning, fontFamily: fonts.bodySemiBold, fontSize: 10 },
  verified: { color: colors.success },
  question: { color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg, lineHeight: 23 },
  answer: { color: colors.success, fontFamily: fonts.bodySemiBold, fontSize: fontSize.base },
  source: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: fontSize.sm },
  telemetry: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: 11 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  miniBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  miniText: { color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm },
  approveBtn: { backgroundColor: colors.success },
  approveText: { color: colors.ink, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm },
  rejectBtn: { backgroundColor: colors.error },
  rejectText: { color: colors.onError, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm },
  primaryBtn: { minHeight: 48, borderRadius: radius.md, backgroundColor: colors.brandPrimary, borderWidth: 2, borderColor: colors.ink, flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  primaryText: { color: colors.onBrandPrimary, fontFamily: fonts.bodySemiBold, fontSize: fontSize.base },
  secondaryBtn: { minHeight: 44, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  secondaryText: { color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm },
  empty: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: fontSize.base, textAlign: "center", paddingVertical: spacing.xl },
  formCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 2, borderColor: colors.ink, padding: spacing.lg, gap: spacing.md },
  sectionTitle: { color: colors.onSurface, fontFamily: fonts.cartoon, fontSize: fontSize.xl, letterSpacing: 0.8 },
  fieldLabel: { color: colors.onSurfaceTertiary, fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 0.8 },
  input: { minHeight: 48, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, color: colors.onSurface, fontFamily: fonts.body, fontSize: fontSize.base },
  multiInput: { minHeight: 86, paddingTop: spacing.md, textAlignVertical: "top" },
  campaignCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 2, borderColor: colors.ink, padding: spacing.lg, gap: spacing.md },
  campaignName: { flex: 1, color: colors.onSurface, fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg },
  progressTrack: { height: 9, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.brandPrimary },
  editOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.72)", padding: spacing.lg, justifyContent: "center" },
  editCard: { maxHeight: "88%", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 3, borderColor: colors.ink, padding: spacing.lg },
});
