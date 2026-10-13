import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyIntent } from "../plugins/apex/core/router.mjs";

const difficulty = (text) => classifyIntent(text).difficulty;

test("mechanical edits and lookups named by their first word are simple", () => {
  for (const text of [
    "format this list",
    "rename this file to notes.md",
    "summarise this note for me",
    "Summarize the meeting in three lines",
    "translate this paragraph into French",
    "proofread the second paragraph",
    "fix the typo in the heading",
    "list the files in this folder",
    "define opportunity cost",
  ])
    assert.equal(difficulty(text), "simple", text);
});

test("a short factual question is simple", () => {
  for (const text of [
    "what is the capital of Australia",
    "when is the SAT registration deadline",
    "how many days are there until June",
    "is this file used anywhere else",
  ])
    assert.equal(difficulty(text), "simple", text);
});

test("a question that asks for judgment, a plan or new work is not simple", () => {
  for (const text of [
    "what should I do about my university shortlist",
    "which is the best way to structure this app",
    "can you write a plan for this week",
    "why is the login page failing",
    "what do you think of this essay",
    "can you build the onboarding screen",
    "Please explain a general concept clearly",
    "fix the login bug in the app",
    "help me revise business for my mock",
  ])
    assert.equal(difficulty(text), "standard", text);
});

test("a long question, a risky one and a complex one are not simple", () => {
  const long =
    "what is the difference between the two approaches we discussed yesterday for the onboarding flow and the tracker";
  assert.equal(difficulty(long), "standard");
  assert.equal(difficulty("what is our production payment setup"), "standard");
  assert.equal(difficulty("summarise this complex proof"), "complex");
});
