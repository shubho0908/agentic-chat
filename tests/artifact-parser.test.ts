import test from "node:test";
import assert from "node:assert/strict";

import { createArtifactStreamParser } from "@/lib/orchestrator/artifactParser";
import { ArtifactEventType, ArtifactType } from "@/types/artifact";

type ParserOutput = ReturnType<ReturnType<typeof createArtifactStreamParser>["push"]>[number];

function textOf(item: ParserOutput): string {
  assert.ok("text" in item);
  return item.text;
}

function eventOf(item: ParserOutput) {
  assert.ok("event" in item);
  return item.event;
}

test("artifact stream parser extracts split artifact tags without leaking markup", () => {
  const parser = createArtifactStreamParser();
  const output = [
    ...parser.push("Before <arti"),
    ...parser.push("fact type=\"html\" title=\"Demo\">\n<h1>Hi</h1></arti"),
    ...parser.push("fact> after"),
    ...parser.flush(),
  ];

  assert.equal(textOf(output[0]), "Before ");

  const start = eventOf(output[1]);
  assert.equal(start.type, ArtifactEventType.START);
  assert.equal(start.artifactType, ArtifactType.HTML);
  assert.equal(start.title, "Demo");

  const chunk = eventOf(output[2]);
  assert.equal(chunk.type, ArtifactEventType.CHUNK);
  assert.equal(chunk.artifactId, start.artifactId);
  assert.equal(chunk.content, "<h1>Hi</h1>");

  const end = eventOf(output[3]);
  assert.equal(end.type, ArtifactEventType.END);
  assert.equal(end.artifactId, start.artifactId);
  assert.equal(textOf(output[4]), " after");
});

test("artifact stream parser closes incomplete empty artifacts on flush", () => {
  const parser = createArtifactStreamParser();
  const output = [
    ...parser.push("<artifact type=\"code\" title=\"Empty\" language=\"ts\">"),
    ...parser.flush(),
  ];

  assert.equal(output.length, 2);
  const start = eventOf(output[0]);
  const end = eventOf(output[1]);
  assert.equal(start.type, ArtifactEventType.START);
  assert.equal(start.language, "ts");
  assert.equal(end.type, ArtifactEventType.END);
  assert.equal(end.artifactId, start.artifactId);
});

test("artifact stream parser leaves invalid artifact tags as text", () => {
  const parser = createArtifactStreamParser();
  const output = [
    ...parser.push("x <artifact type=\"unknown\" title=\"Bad\">body"),
    ...parser.flush(),
  ];

  assert.deepEqual(output, [
    { text: "x " },
    { text: "<artifact type=\"unknown\" title=\"Bad\">" },
    { text: "body" },
  ]);
});
