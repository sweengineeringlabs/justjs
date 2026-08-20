import { describe, it, expect, afterEach } from "bun:test";
import { getEc2Ledger, addEc2LedgerEntry, removeEc2LedgerEntry, reconcileEc2Ledger } from "./ec2_ledger.js";

afterEach(() => {
  globalThis.localStorage?.removeItem("justjs:ai-editor:ec2-ledger");
});

describe("ec2_ledger", () => {
  it("test_get_ledger_returns_an_empty_array_before_anything_is_added", () => {
    expect(getEc2Ledger()).toEqual([]);
  });

  it("test_add_then_get_round_trips_the_real_entry", () => {
    addEc2LedgerEntry({ instanceId: "i-1", instanceType: "t3.micro", launchedAt: "2026-07-25T00:00:00Z" });
    expect(getEc2Ledger()).toEqual([{ instanceId: "i-1", instanceType: "t3.micro", launchedAt: "2026-07-25T00:00:00Z" }]);
  });

  it("test_adding_the_same_instance_id_twice_replaces_rather_than_duplicates", () => {
    addEc2LedgerEntry({ instanceId: "i-1", instanceType: "t3.micro", launchedAt: "2026-07-25T00:00:00Z" });
    addEc2LedgerEntry({ instanceId: "i-1", instanceType: "t3.large", launchedAt: "2026-07-25T01:00:00Z" });
    expect(getEc2Ledger()).toEqual([{ instanceId: "i-1", instanceType: "t3.large", launchedAt: "2026-07-25T01:00:00Z" }]);
  });

  it("test_remove_entry_drops_only_the_matching_instance_id", () => {
    addEc2LedgerEntry({ instanceId: "i-1", instanceType: "t3.micro", launchedAt: "t1" });
    addEc2LedgerEntry({ instanceId: "i-2", instanceType: "t3.small", launchedAt: "t2" });
    removeEc2LedgerEntry("i-1");
    expect(getEc2Ledger()).toEqual([{ instanceId: "i-2", instanceType: "t3.small", launchedAt: "t2" }]);
  });

  it("test_reconcile_drops_entries_not_present_in_the_live_instance_set", () => {
    addEc2LedgerEntry({ instanceId: "i-1", instanceType: "t3.micro", launchedAt: "t1" });
    addEc2LedgerEntry({ instanceId: "i-2", instanceType: "t3.small", launchedAt: "t2" });
    reconcileEc2Ledger(new Set(["i-1"]));
    expect(getEc2Ledger()).toEqual([{ instanceId: "i-1", instanceType: "t3.micro", launchedAt: "t1" }]);
  });

  it("test_reconcile_with_an_empty_live_set_clears_the_entire_ledger", () => {
    addEc2LedgerEntry({ instanceId: "i-1", instanceType: "t3.micro", launchedAt: "t1" });
    reconcileEc2Ledger(new Set());
    expect(getEc2Ledger()).toEqual([]);
  });
});
