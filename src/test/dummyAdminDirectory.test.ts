import { describe, expect, it } from "vitest";
import {
  loadDemoOnboardingAnalytics,
  loadDemoUserDirectory,
  loadDemoWaitlistApplicants,
} from "@/pages/test-admin/dummyDirectory";

describe("dummy admin directory", () => {
  it("builds a populated onboarding analytics payload", () => {
    const all = loadDemoOnboardingAnalytics("all");
    const week = loadDemoOnboardingAnalytics("7d");

    expect(all.kpis.started).toBeGreaterThan(1_000);
    expect(all.kpis.completed).toBeGreaterThan(1_000);
    expect(all.kpis.completed).toBeLessThan(all.kpis.started);
    expect(all.steps).toHaveLength(5);
    expect(all.steps[0].reached).toBeGreaterThan(all.steps[4].reached);
    expect(all.steps.some((step) => step.highestDropOff)).toBe(true);
    expect(all.personas).toHaveLength(3);
    expect(all.stalled.length).toBeGreaterThan(10);
    expect(week.kpis.started).toBeLessThan(all.kpis.started);
    expect(week.stalled.length).toBe(all.stalled.length);
  });

  it("builds a busy waitlist approval queue", () => {
    const applicants = loadDemoWaitlistApplicants();
    const pending = applicants.filter((row) => row.status === "pending");
    const approved = applicants.filter((row) => row.status === "approved");
    const rejected = applicants.filter((row) => row.status === "rejected");

    expect(applicants.length).toBeGreaterThan(60);
    expect(pending.length).toBeGreaterThan(20);
    expect(approved.length).toBeGreaterThan(10);
    expect(rejected.length).toBeGreaterThan(5);
    expect(applicants.some((row) => row.admin_notes)).toBe(true);
    expect(applicants.some((row) => row.metadata?.utm_source)).toBe(true);
  });

  it("builds a user directory with accounts, waitlist, and invites", () => {
    const { users, applicants } = loadDemoUserDirectory();
    const emails = new Set(users.map((user) => user.email.toLowerCase()));
    const waitlist = applicants.filter((row) => row.status === "pending");
    const invites = applicants.filter((row) => row.status === "approved" && !emails.has(row.email.toLowerCase()));

    expect(users.length).toBeGreaterThan(40);
    expect(users.some((user) => user.permission === "god")).toBe(true);
    expect(users.some((user) => user.banned)).toBe(true);
    expect(new Set(users.map((user) => user.subscription)).size).toBeGreaterThan(2);
    expect(waitlist.length).toBeGreaterThan(10);
    expect(invites.length).toBeGreaterThan(5);
  });
});
