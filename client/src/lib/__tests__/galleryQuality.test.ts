import { describe, it, expect } from "vitest";
import { isRealEstateGallery, isRealEstateProject, keepsFullQuality } from "../galleryQuality";
import type { Client, Project } from "../types";

const client = (id: string, clientType: Client["clientType"], extra: Partial<Client> = {}) =>
  ({ id, company: id, clientType, ...extra }) as unknown as Client;
const project = (clientId: string, billToId: string | null = null) =>
  ({ id: `p_${clientId}`, clientId, billToId }) as unknown as Project;

const clientsById: Record<string, Client> = {
  agent1: client("agent1", "agent", { brokerId: "cbsr" }),
  cbsr: client("cbsr", "broker"),
  school: client("school", "standard"),
  family: client("family", "standard"),
  peer: client("peer", "photography"),
};

describe("isRealEstateProject", () => {
  it("is real estate when the client is an agent", () => {
    expect(isRealEstateProject(project("agent1"), clientsById)).toBe(true);
  });

  it("is real estate when a standard client's shoot is billed to a brokerage", () => {
    expect(isRealEstateProject(project("school", "cbsr"), clientsById)).toBe(true);
  });

  it("is not real estate for a school, family or photographer client", () => {
    expect(isRealEstateProject(project("school"), clientsById)).toBe(false);
    expect(isRealEstateProject(project("family"), clientsById)).toBe(false);
    expect(isRealEstateProject(project("peer"), clientsById)).toBe(false);
  });

  it("is not real estate with no project to classify", () => {
    expect(isRealEstateProject(null, clientsById)).toBe(false);
    expect(isRealEstateProject(undefined, clientsById)).toBe(false);
  });
});

describe("isRealEstateGallery", () => {
  it("follows the client rule when the switch is off", () => {
    expect(isRealEstateGallery({ realEstate: false }, project("agent1"), clientsById)).toBe(true);
    expect(isRealEstateGallery({ realEstate: undefined }, project("school"), clientsById)).toBe(false);
  });

  it("is real estate when the gallery's own switch is on, whoever the client is", () => {
    expect(isRealEstateGallery({ realEstate: true }, project("school"), clientsById)).toBe(true);
    expect(isRealEstateGallery({ realEstate: true }, project("family"), clientsById)).toBe(true);
  });

  it("lets the switch win even with no project to classify", () => {
    expect(isRealEstateGallery({ realEstate: true }, null, clientsById)).toBe(true);
    expect(isRealEstateGallery(null, null, clientsById)).toBe(false);
  });
});

describe("keepsFullQuality", () => {
  it("keeps full quality for every non-real-estate shoot, switch or no switch", () => {
    expect(keepsFullQuality({ keepOriginals: false }, project("family"), clientsById)).toBe(true);
    expect(keepsFullQuality({ keepOriginals: undefined }, project("school"), clientsById)).toBe(true);
  });

  it("keeps full quality for a gallery with no project", () => {
    expect(keepsFullQuality({ keepOriginals: false }, null, clientsById)).toBe(true);
  });

  it("re-saves small for real estate by default", () => {
    expect(keepsFullQuality({ keepOriginals: false }, project("agent1"), clientsById)).toBe(false);
    expect(keepsFullQuality({ keepOriginals: false }, project("school", "cbsr"), clientsById)).toBe(false);
  });

  it("lets the owner switch full quality on for a real estate shoot", () => {
    expect(keepsFullQuality({ keepOriginals: true }, project("agent1"), clientsById)).toBe(true);
  });

  it("re-saves small when the gallery's real estate switch is on for a standard client", () => {
    expect(keepsFullQuality({ keepOriginals: false, realEstate: true }, project("school"), clientsById)).toBe(false);
  });

  it("keeps full quality when both switches are on", () => {
    expect(keepsFullQuality({ keepOriginals: true, realEstate: true }, project("school"), clientsById)).toBe(true);
  });
});
