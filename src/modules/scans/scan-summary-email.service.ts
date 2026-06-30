import type { SupabaseClient } from "@supabase/supabase-js";
import type pino from "pino";

import { getAppUrl, sendEmail, type EmailMessage } from "../email/resend-email.service.js";

type ScanSummaryRecipient = {
  email: string;
  fullName: string | null;
};

type ScanSummaryLoadResult = {
  scanJobId: string;
  recipients: ScanSummaryRecipient[];
  organizationName: string;
  assetId: string;
  assetTitle: string;
  scanFinishedAt: string;
  candidatesCount: number;
  newDetections: number;
  updatedDetections: number;
  status: "completed" | "failed" | "processing" | "pending" | "cancelled";
  alreadySentAt: string | null;
};

type MaybeSendCompletedScanSummaryEmailDeps = {
  loadSummary: () => Promise<ScanSummaryLoadResult | null>;
  logger: Pick<pino.Logger, "error" | "info" | "warn">;
  markSent: (scanJobId: string) => Promise<void>;
  sendEmail: (message: EmailMessage) => Promise<void>;
};

type BuildScanSummaryEmailParams = {
  organizationName: string;
  assetTitle: string;
  scanFinishedAt: string;
  candidatesCount: number;
  newDetections: number;
  updatedDetections: number;
  dashboardUrl: string;
};

type ScanJobLookupRow = {
  id: string;
  organization_id: string;
  asset_id: string;
  status: ScanSummaryLoadResult["status"];
  completed_run_id: string | null;
  summary_email_sent_at: string | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getNumberFromContext(context: Record<string, unknown>, key: string) {
  const value = context[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatFinishedAt(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function createEmailLayout({
  eyebrow,
  title,
  intro,
  metrics,
  actionLabel,
  actionUrl,
  note,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  metrics: Array<{ label: string; value: string }>;
  actionLabel: string;
  actionUrl: string;
  note: string;
}) {
  const metricsMarkup = metrics
    .map(
      (metric) => `<div style="min-width:140px;flex:1;padding:16px 18px;border-radius:20px;background:#eff6ff;border:1px solid rgba(37,99,235,0.12);">
        <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">${escapeHtml(metric.label)}</p>
        <p style="margin:10px 0 0;font-size:26px;font-weight:700;color:#0f172a;">${escapeHtml(metric.value)}</p>
      </div>`,
    )
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="padding:32px 16px;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:28px;overflow:hidden;border:1px solid rgba(37,99,235,0.1);box-shadow:0 24px 70px rgba(15,23,42,0.08);">
        <div style="padding:28px;background:radial-gradient(circle at top left,rgba(147,197,253,0.9),transparent 30%),linear-gradient(135deg,#0f172a,#162338 55%,#1d4ed8 100%);color:#ffffff;">
          <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.24em;text-transform:uppercase;color:rgba(239,246,255,0.72);">${escapeHtml(eyebrow)}</p>
          <h1 style="margin:0;font-size:28px;line-height:1.2;">${escapeHtml(title)}</h1>
        </div>
        <div style="padding:30px 28px 32px;">
          <p style="margin:0;font-size:16px;line-height:1.8;color:#334155;">${intro}</p>
          <div style="display:flex;flex-wrap:wrap;gap:12px;margin:24px 0 0;">${metricsMarkup}</div>
          <p style="margin:24px 0 0;">
            <a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#eff6ff;text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:700;box-shadow:0 14px 28px rgba(37,99,235,0.28);">
              ${escapeHtml(actionLabel)}
            </a>
          </p>
          <p style="margin:24px 0 0;color:#64748b;font-size:13px;line-height:1.7;">${escapeHtml(note)}</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export function buildScanSummaryEmail({
  organizationName,
  assetTitle,
  scanFinishedAt,
  candidatesCount,
  newDetections,
  updatedDetections,
  dashboardUrl,
}: BuildScanSummaryEmailParams) {
  const formattedFinishedAt = formatFinishedAt(scanFinishedAt);

  return {
    subject: `Resumo da varredura: ${assetTitle}`,
    text:
      `A varredura do ativo "${assetTitle}" foi concluida para ${organizationName} em ${formattedFinishedAt}. ` +
      `Resultados encontrados: ${candidatesCount}. Novas ocorrencias: ${newDetections}. Ocorrencias atualizadas: ${updatedDetections}. ` +
      `Acompanhe o painel em ${dashboardUrl}.`,
    html: createEmailLayout({
      eyebrow: "Resumo de varredura",
      title: `Varredura concluida para ${assetTitle}`,
      intro: `A organizacao <strong>${escapeHtml(organizationName)}</strong> concluiu uma nova leitura do ativo <strong>${escapeHtml(assetTitle)}</strong> em ${escapeHtml(formattedFinishedAt)}.`,
      metrics: [
        { label: "Resultados encontrados", value: String(candidatesCount) },
        { label: "Novas ocorrencias", value: String(newDetections) },
        { label: "Ocorrencias atualizadas", value: String(updatedDetections) },
      ],
      actionLabel: "Abrir painel",
      actionUrl: dashboardUrl,
      note: "Esse resumo foi enviado automaticamente ao concluir a varredura do ativo monitorado.",
    }),
  };
}

async function getScanJobLookup(
  supabase: SupabaseClient,
  params: { scanJobId?: string; scanRunId?: string },
) {
  if (params.scanJobId) {
    const { data, error } = await supabase
      .from("scan_jobs")
      .select(
        "id, organization_id, asset_id, status, completed_run_id, summary_email_sent_at",
      )
      .eq("id", params.scanJobId)
      .maybeSingle<ScanJobLookupRow>();

    if (error) {
      throw error;
    }

    return data;
  }

  if (!params.scanRunId) {
    return null;
  }

  const { data, error } = await supabase
    .from("scan_jobs")
    .select("id, organization_id, asset_id, status, completed_run_id, summary_email_sent_at")
    .eq("completed_run_id", params.scanRunId)
    .maybeSingle<ScanJobLookupRow>();

  if (error) {
    throw error;
  }

  return data;
}

async function loadCompletedScanSummary(
  supabase: SupabaseClient,
  params: { scanJobId?: string; scanRunId?: string },
): Promise<ScanSummaryLoadResult | null> {
  const scanJob = await getScanJobLookup(supabase, params);

  if (!scanJob?.completed_run_id) {
    return null;
  }

  const [scanRunResponse, assetResponse, organizationResponse, membershipsResponse] =
    await Promise.all([
      supabase
        .from("scan_runs")
        .select("status, finished_at, context")
        .eq("id", scanJob.completed_run_id)
        .maybeSingle<{
          status: "completed" | "failed" | "started" | "vision_completed" | "evidence_pending";
          finished_at: string | null;
          context: Record<string, unknown>;
        }>(),
      supabase
        .from("assets")
        .select("id, title")
        .eq("id", scanJob.asset_id)
        .eq("organization_id", scanJob.organization_id)
        .maybeSingle<{ id: string; title: string | null }>(),
      supabase
        .from("organizations")
        .select("name")
        .eq("id", scanJob.organization_id)
        .maybeSingle<{ name: string | null }>(),
      supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", scanJob.organization_id)
        .eq("is_active", true)
        .returns<Array<{ user_id: string }>>(),
    ]);

  if (
    scanRunResponse.error ||
    assetResponse.error ||
    organizationResponse.error ||
    membershipsResponse.error
  ) {
    throw (
      scanRunResponse.error ??
      assetResponse.error ??
      organizationResponse.error ??
      membershipsResponse.error
    );
  }

  const memberIds = (membershipsResponse.data ?? []).map((membership) => membership.user_id);
  const { data: profiles, error: profilesError } = memberIds.length
    ? await supabase
        .from("profiles")
        .select("email, full_name, is_active")
        .in("id", memberIds)
        .returns<Array<{ email: string | null; full_name: string | null; is_active: boolean }>>()
    : { data: [], error: null };

  if (profilesError) {
    throw profilesError;
  }

  const recipients = (profiles ?? [])
    .filter((profile) => profile.is_active && typeof profile.email === "string" && profile.email.length > 0)
    .map((profile) => ({
      email: profile.email as string,
      fullName: profile.full_name,
    }));

  if (!scanRunResponse.data?.finished_at) {
    return null;
  }

  return {
    scanJobId: scanJob.id,
    recipients,
    organizationName: organizationResponse.data?.name ?? "Organizacao monitorada",
    assetId: assetResponse.data?.id ?? scanJob.asset_id,
    assetTitle: assetResponse.data?.title?.trim() || "Ativo monitorado",
    scanFinishedAt: scanRunResponse.data.finished_at,
    candidatesCount: getNumberFromContext(scanRunResponse.data.context ?? {}, "candidatesCount"),
    newDetections: getNumberFromContext(scanRunResponse.data.context ?? {}, "newDetections"),
    updatedDetections: getNumberFromContext(scanRunResponse.data.context ?? {}, "updatedDetections"),
    status:
      scanJob.status === "completed" && scanRunResponse.data.status === "completed"
        ? "completed"
        : scanJob.status,
    alreadySentAt: scanJob.summary_email_sent_at,
  };
}

async function markScanSummaryEmailSent(supabase: SupabaseClient, scanJobId: string) {
  const { error } = await supabase
    .from("scan_jobs")
    .update({
      summary_email_sent_at: new Date().toISOString(),
    })
    .eq("id", scanJobId)
    .is("summary_email_sent_at", null);

  if (error) {
    throw error;
  }
}

export async function maybeSendCompletedScanSummaryEmail({
  loadSummary,
  logger,
  markSent,
  sendEmail: sendEmailMessage,
}: MaybeSendCompletedScanSummaryEmailDeps) {
  const summary = await loadSummary();

  if (!summary) {
    return;
  }

  if (summary.status !== "completed" || summary.alreadySentAt || summary.recipients.length === 0) {
    return;
  }

  const dashboardUrl = `${getAppUrl()}/detections?asset=${encodeURIComponent(summary.assetId)}`;
  const email = buildScanSummaryEmail({
    organizationName: summary.organizationName,
    assetTitle: summary.assetTitle,
    scanFinishedAt: summary.scanFinishedAt,
    candidatesCount: summary.candidatesCount,
    newDetections: summary.newDetections,
    updatedDetections: summary.updatedDetections,
    dashboardUrl,
  });

  try {
    await sendEmailMessage({
      to: summary.recipients.map((recipient) => recipient.email),
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    await markSent(summary.scanJobId);
    logger.info(
      {
        event: "scan_summary_email_sent",
        scanJobId: summary.scanJobId,
        recipientsCount: summary.recipients.length,
      },
      "Scan summary email sent",
    );
  } catch (error) {
    logger.error(
      {
        event: "scan_summary_email_failed",
        scanJobId: summary.scanJobId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Scan summary email failed",
    );
    throw error;
  }
}

export async function sendCompletedScanSummaryEmail(
  supabase: SupabaseClient,
  logger: Pick<pino.Logger, "error" | "info" | "warn">,
  params: { scanJobId?: string; scanRunId?: string },
) {
  return maybeSendCompletedScanSummaryEmail({
    logger,
    loadSummary: () => loadCompletedScanSummary(supabase, params),
    markSent: (scanJobId) => markScanSummaryEmailSent(supabase, scanJobId),
    sendEmail,
  });
}
