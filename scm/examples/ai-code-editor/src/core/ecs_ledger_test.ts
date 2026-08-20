import { describe, it, expect, afterEach } from "bun:test";
import { getEcsLedger, addEcsLedgerEntry, removeEcsLedgerEntry, reconcileEcsLedger, removeEcsLedgerEntriesForCluster } from "./ecs_ledger.js";

afterEach(() => {
  globalThis.localStorage?.removeItem("justjs:ai-editor:ecs-ledger");
});

describe("ecs_ledger", () => {
  it("test_get_ledger_returns_an_empty_array_before_anything_is_added", () => {
    expect(getEcsLedger()).toEqual([]);
  });

  it("test_add_then_get_round_trips_the_real_entry", () => {
    addEcsLedgerEntry({ clusterName: "my-cluster", taskArn: "arn:task/1", taskDefinitionArn: "arn:task-def/my-app:1", startedAt: "2026-07-26T00:00:00Z" });
    expect(getEcsLedger()).toEqual([{ clusterName: "my-cluster", taskArn: "arn:task/1", taskDefinitionArn: "arn:task-def/my-app:1", startedAt: "2026-07-26T00:00:00Z" }]);
  });

  it("test_adding_the_same_task_arn_twice_replaces_rather_than_duplicates", () => {
    addEcsLedgerEntry({ clusterName: "my-cluster", taskArn: "arn:task/1", taskDefinitionArn: "arn:task-def/my-app:1", startedAt: "t1" });
    addEcsLedgerEntry({ clusterName: "my-cluster", taskArn: "arn:task/1", taskDefinitionArn: "arn:task-def/my-app:2", startedAt: "t2" });
    expect(getEcsLedger()).toEqual([{ clusterName: "my-cluster", taskArn: "arn:task/1", taskDefinitionArn: "arn:task-def/my-app:2", startedAt: "t2" }]);
  });

  it("test_remove_entry_drops_only_the_matching_task_arn", () => {
    addEcsLedgerEntry({ clusterName: "my-cluster", taskArn: "arn:task/1", taskDefinitionArn: "arn:task-def/1", startedAt: "t1" });
    addEcsLedgerEntry({ clusterName: "my-cluster", taskArn: "arn:task/2", taskDefinitionArn: "arn:task-def/1", startedAt: "t2" });
    removeEcsLedgerEntry("arn:task/1");
    expect(getEcsLedger()).toEqual([{ clusterName: "my-cluster", taskArn: "arn:task/2", taskDefinitionArn: "arn:task-def/1", startedAt: "t2" }]);
  });

  it("test_reconcile_drops_entries_for_the_given_cluster_not_present_in_the_live_task_set", () => {
    addEcsLedgerEntry({ clusterName: "my-cluster", taskArn: "arn:task/1", taskDefinitionArn: "arn:task-def/1", startedAt: "t1" });
    addEcsLedgerEntry({ clusterName: "my-cluster", taskArn: "arn:task/2", taskDefinitionArn: "arn:task-def/1", startedAt: "t2" });
    reconcileEcsLedger("my-cluster", new Set(["arn:task/1"]));
    expect(getEcsLedger()).toEqual([{ clusterName: "my-cluster", taskArn: "arn:task/1", taskDefinitionArn: "arn:task-def/1", startedAt: "t1" }]);
  });

  it("test_reconcile_never_touches_entries_belonging_to_a_different_cluster", () => {
    addEcsLedgerEntry({ clusterName: "cluster-a", taskArn: "arn:task/a", taskDefinitionArn: "arn:task-def/1", startedAt: "t1" });
    addEcsLedgerEntry({ clusterName: "cluster-b", taskArn: "arn:task/b", taskDefinitionArn: "arn:task-def/1", startedAt: "t2" });
    reconcileEcsLedger("cluster-a", new Set());
    expect(getEcsLedger()).toEqual([{ clusterName: "cluster-b", taskArn: "arn:task/b", taskDefinitionArn: "arn:task-def/1", startedAt: "t2" }]);
  });

  it("test_remove_entries_for_cluster_drops_every_entry_in_that_cluster_only", () => {
    addEcsLedgerEntry({ clusterName: "cluster-a", taskArn: "arn:task/a", taskDefinitionArn: "arn:task-def/1", startedAt: "t1" });
    addEcsLedgerEntry({ clusterName: "cluster-b", taskArn: "arn:task/b", taskDefinitionArn: "arn:task-def/1", startedAt: "t2" });
    removeEcsLedgerEntriesForCluster("cluster-a");
    expect(getEcsLedger()).toEqual([{ clusterName: "cluster-b", taskArn: "arn:task/b", taskDefinitionArn: "arn:task-def/1", startedAt: "t2" }]);
  });
});
