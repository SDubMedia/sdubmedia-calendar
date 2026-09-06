import { describe, it, expect } from "vitest";
import { buildRows, buildChapters } from "../editorialRows";

type F = { id: string; width: number | null; height: number | null; folderId?: string | null };
const L = (id: string, folderId: string | null = null): F => ({ id, width: 3000, height: 2000, folderId });
const P = (id: string, folderId: string | null = null): F => ({ id, width: 2000, height: 3000, folderId });
const shape = (rows: ReturnType<typeof buildRows<F>>) => rows.map(r => `${r.kind}:${r.items.map(i => i.id).join("")}`);

describe("buildRows", () => {
  it("leads with a full-width statement when the first photo is a landscape", () => {
    expect(shape(buildRows([L("a"), L("b"), L("c")]))).toEqual(["statement:a", "two:bc"]);
  });

  it("pairs two portraits", () => {
    expect(shape(buildRows([P("a"), P("b")]))).toEqual(["two:ab"]);
  });

  it("puts a portrait beside a landscape", () => {
    expect(shape(buildRows([P("x"), L("a"), P("b")]))).toEqual(["portrait:x", "wide:ab"]);
  });

  it("strips three landscapes together after the statement", () => {
    expect(shape(buildRows([L("a"), L("b"), L("c"), L("d")]))).toEqual(["statement:a", "three:bcd"]);
  });

  it("centres a lone portrait", () => {
    expect(shape(buildRows([L("a"), P("b")]))).toEqual(["statement:a", "portrait:b"]);
  });

  it("never reorders — every id appears once, in the original order", () => {
    const files = [P("1"), L("2"), L("3"), P("4"), P("5"), L("6"), L("7"), L("8"), P("9")];
    const rows = buildRows(files);
    expect(rows.flatMap(r => r.items.map(i => i.id))).toEqual(files.map(f => f.id));
  });

  it("treats a photo with unknown dimensions as a landscape", () => {
    expect(shape(buildRows([{ id: "a", width: null, height: null }, L("b")]))).toEqual(["statement:a", "statement:b"]);
  });

  it("returns nothing for an empty gallery", () => {
    expect(buildRows([])).toEqual([]);
  });
});

describe("buildChapters", () => {
  const folders = [{ id: "f1", name: "Ceremony" }, { id: "f2", name: "Reception" }];

  it("makes one unnamed chapter for a gallery with no folders", () => {
    const ch = buildChapters([L("a"), L("b")], []);
    expect(ch).toHaveLength(1);
    expect(ch[0].name).toBeNull();
    expect(shape(ch[0].rows)).toEqual(["statement:a", "statement:b"]);
  });

  it("splits consecutive folder runs into named chapters, keeping order", () => {
    const ch = buildChapters([L("a"), L("b", "f1"), P("c", "f1"), L("d", "f2")], folders);
    expect(ch.map(c => c.name)).toEqual([null, "Ceremony", "Reception"]);
    expect(shape(ch[1].rows)).toEqual(["statement:b", "portrait:c"]);
  });

  it("treats an unknown folder id as unfoldered", () => {
    const ch = buildChapters([L("a", "ghost"), L("b")], folders);
    expect(ch).toHaveLength(1);
    expect(ch[0].name).toBeNull();
  });
});
