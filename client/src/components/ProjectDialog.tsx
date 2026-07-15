// ============================================================
// ProjectDialog — Create / Edit project modal
// Design: Dark Cinematic Studio
// Billing Model: Hourly — crew entries track hours worked + pay rate per hour
// ============================================================

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/DateTimeField";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Plus, Trash2, ArrowLeft, Save, ChevronRight, Images, Upload, ArrowUpRight } from "lucide-react";
import { useLocation } from "wouter";
import { getAuthToken } from "@/lib/supabase";
import { useApp } from "@/contexts/AppContext";
import ProjectHistorySection from "@/components/ProjectHistorySection";
import { getProjectInvoiceAmount, getProjectCrewCost, getProjectProductCost, shootDurationMinFor, getCrewShootStatus } from "@/lib/data";
import { toUploadableImage } from "@/lib/heic";
import { formatPhoneDisplay } from "@/lib/utils";
import type { Project, ProjectCrewEntry, ProjectPostEntry, ProjectStatus, BillingModel, ProjectServiceSelection, ProjectProductSelection, EditType } from "@/lib/types";
import ProjectServiceBundlePicker from "@/components/ProjectServiceBundlePicker";
import { toast } from "sonner";
import { getProjectLimitState } from "@/lib/tier-limits";
import UpgradeDialog from "./UpgradeDialog";

interface Props {
  open: boolean;
  onClose: () => void;
  project?: Project;
  defaultDate?: string;
  defaultClientId?: string;
  defaultNotes?: string;
  /** Pre-fill the start time (e.g. booking into an open calendar slot). */
  defaultStartTime?: string;
  /** Pre-assign a shooter to the first crew row (e.g. the slot's free shooter). */
  defaultCrewMemberId?: string;
  onCreated?: (project: Project) => void;
  /** Open restoring the saved draft (the "Resume Project" entry point). */
  resume?: boolean;
}

// A half-entered NEW project is stashed here on close so it can be resumed.
// Device-local, single slot. Cleared on save.
export const PROJECT_DRAFT_KEY = "slate:projectDraft";
export function hasProjectDraft(): boolean {
  try { return !!localStorage.getItem(PROJECT_DRAFT_KEY); } catch { return false; }
}

// Add minutes to "HH:MM", clamped to the same day.
function addMinutesT(t: string, mins: number): string {
  const [h, m] = (t || "0:0").split(":").map(Number);
  const total = Math.min(h * 60 + m + mins, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// "Shown for" choices when scoping an edit type to a client type.
const EDIT_SCOPE_OPTIONS: { value: "any" | "real_estate" | "wedding" | "photography"; label: string }[] = [
  { value: "any", label: "All clients" },
  { value: "real_estate", label: "Real estate" },
  { value: "wedding", label: "Weddings" },
  { value: "photography", label: "Photography" },
];

// 15-min time options as a styled <select> — native <input type="time"> overflows
// its column on iOS. Include the current value if off-grid so it still shows.
function fmtTime12(t: string): string {
  const [hStr, m] = (t || "").split(":");
  const h = Number(hStr);
  if (Number.isNaN(h)) return t || "";
  return `${h % 12 === 0 ? 12 : h % 12}:${m ?? "00"} ${h >= 12 ? "PM" : "AM"}`;
}
const TIME_OPTIONS = Array.from({ length: (24 * 60) / 15 }, (_, i) => {
  const mins = i * 15;
  const value = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return { value, label: fmtTime12(value) };
});
function timeOptionsWith(current: string) {
  return TIME_OPTIONS.some(o => o.value === current) || !current
    ? TIME_OPTIONS
    : [{ value: current, label: fmtTime12(current) }, ...TIME_OPTIONS];
}

const emptyCrewEntry = (): ProjectCrewEntry => ({
  crewMemberId: "",
  role: "",
  hoursWorked: 0,
  payRatePerHour: 0,
});

const emptyPostEntry = (): ProjectPostEntry => ({
  crewMemberId: "",
  role: "",
  hoursWorked: 0,
  payRatePerHour: 0,
});

// First crew row for a NEW project — pre-assigned to a shooter when booking into
// an open calendar slot, otherwise blank.
const initialCrew = (crewMemberId?: string): ProjectCrewEntry[] =>
  [crewMemberId ? { ...emptyCrewEntry(), crewMemberId, role: "Photographer" } : emptyCrewEntry()];

// Read an image's natural dimensions client-side (best-effort) before upload.
function readImageDims(file: File): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) { resolve({ width: null, height: null }); return; }
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve({ width: null, height: null }); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

export default function ProjectDialog({ open, onClose, project, defaultDate, defaultClientId, defaultNotes, defaultStartTime, defaultCrewMemberId, onCreated, resume }: Props) {
  const { data, addProject, updateProject, addProjectType, addEditType, updateEditType, deleteEditType, addLocation, updateLocation, addClient, addCrewMember, createReShootGallery, registerDeliveryFile } = useApp();
  const isEdit = !!project;

  const [clientId, setClientId] = useState(project?.clientId ?? defaultClientId ?? data.clients[0]?.id ?? "");
  const [projectTypeId, setProjectTypeId] = useState(project?.projectTypeId ?? "");
  const [locationId, setLocationId] = useState(project?.locationId ?? "");
  const [date, setDate] = useState(project?.date ?? defaultDate ?? "");
  const [startTime, setStartTime] = useState(project?.startTime ?? defaultStartTime ?? "09:00");
  const [endTime, setEndTime] = useState(project?.endTime ?? "11:00");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "upcoming");
  const [crew, setCrew] = useState<ProjectCrewEntry[]>(project?.crew?.length ? project.crew : initialCrew(defaultCrewMemberId));
  const [postProduction, setPostProduction] = useState<ProjectPostEntry[]>(project?.postProduction ?? [emptyPostEntry()]);
  // Raw text for the hours inputs while typing, so intermediate decimal states
  // like "0." or "1." survive (a number model would strip the point and block
  // half-hour entries). The numeric hoursWorked stays authoritative for totals.
  const [crewHoursText, setCrewHoursText] = useState<Record<number, string>>({});
  const [postHoursText, setPostHoursText] = useState<Record<number, string>>({});
  const [editTypes, setEditTypes] = useState<string[]>(project?.editTypes ?? []);
  const [notes, setNotes] = useState(project?.notes ?? defaultNotes ?? "");
  const [deliverableUrl, setDeliverableUrl] = useState(project?.deliverableUrl ?? "");
  const [cancellationReason, setCancellationReason] = useState(project?.cancellationReason ?? "");
  const [projectRate, setProjectRate] = useState<number | null>(project?.projectRate ?? null);
  const [billingModelOverride, setBillingModelOverride] = useState<BillingModel | null>(project?.billingModel ?? null);
  const [billingRateOverride, setBillingRateOverride] = useState<number | null>(project?.billingRate ?? null);

  // Inline creation state
  const [showNewType, setShowNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [showNewEditType, setShowNewEditType] = useState(false);
  const [newEditTypeName, setNewEditTypeName] = useState("");
  const [manageEditTypes, setManageEditTypes] = useState(false);
  const [showNewLocation, setShowNewLocation] = useState(false);
  const [newLocForm, setNewLocForm] = useState({ name: "", address: "", city: "", state: "TN", zip: "", oneTimeUse: false });
  const [locationTab, setLocationTab] = useState<"saved" | "one-time">("saved");
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [showUpgrade, setShowUpgrade] = useState(false);
  // Inline quick-create crew member — tracks which row requested the new person
  const [quickAddCrew, setQuickAddCrew] = useState<{ idx: number; section: "crew" | "post" } | null>(null);
  const [newCrewName, setNewCrewName] = useState("");
  // Discount fields — applied to the project's billable amount when invoiced.
  const [discountType, setDiscountType] = useState<"percent" | "fixed" | null>(project?.discountType ?? null);
  const [discountAmount, setDiscountAmount] = useState<number>(project?.discountAmount ?? 0);
  const [discountReason, setDiscountReason] = useState<string>(project?.discountReason ?? "");

  // Service-bundle pricing (new model). If serviceCategoryId is set,
  // bundleServices holds the picked services with denormalized labels
  // and snapshotted prices. These become invoice line items at save time.
  const [serviceCategoryId, setServiceCategoryId] = useState<string | null>(project?.serviceCategoryId ?? null);
  const [bundleServices, setBundleServices] = useState<ProjectServiceSelection[]>(project?.services ?? []);
  // Broker billing: who this shoot bills to, and per-house product costs.
  const [billToId, setBillToId] = useState<string | null>(project?.billToId ?? null);
  const [products, setProducts] = useState<ProjectProductSelection[]>(project?.products ?? []);
  // Broker entry: when a broker is chosen as the "client", the shoot is really
  // for one of their agents — brokerSelectId holds the broker, clientId holds
  // the chosen agent. Picking the agent auto-bills the broker (payer resolves).
  const [brokerSelectId, setBrokerSelectId] = useState<string>("");
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  // Real-estate property address — typed in, saved as a one-time location on
  // the project (not added to the reusable saved-locations list).
  const [propertyAddress, setPropertyAddress] = useState("");

  const wasOpen = useRef(false);
  useEffect(() => {
    // Only reset form state when dialog transitions from closed → open
    if (open && !wasOpen.current) {
      // Fresh open: drop any in-progress hours text from a prior project so it
      // doesn't shadow the numeric values being loaded here.
      setCrewHoursText({}); setPostHoursText({});
      // Resume a half-entered project from the saved draft.
      if (resume && !project) {
        let d: any = null;
        try { d = JSON.parse(localStorage.getItem(PROJECT_DRAFT_KEY) || "null"); } catch { /* ignore */ }
        if (d) {
          setBrokerSelectId(d.brokerSelectId ?? "");
          setClientId(d.clientId ?? "");
          setProjectTypeId(d.projectTypeId ?? "");
          setLocationId(d.locationId ?? "");
          setPropertyAddress(d.propertyAddress ?? "");
          setDate(d.date ?? "");
          setStartTime(d.startTime ?? "09:00");
          setEndTime(d.endTime ?? "11:00");
          setStatus(d.status ?? "upcoming");
          setCrew(d.crew?.length ? d.crew : [emptyCrewEntry()]);
          setPostProduction(d.postProduction?.length ? d.postProduction : [emptyPostEntry()]);
          setEditTypes(d.editTypes ?? []);
          setNotes(d.notes ?? "");
          setDeliverableUrl(d.deliverableUrl ?? "");
          setCancellationReason(d.cancellationReason ?? "");
          setProjectRate(d.projectRate ?? null);
          setBillingModelOverride(d.billingModelOverride ?? null);
          setBillingRateOverride(d.billingRateOverride ?? null);
          setDiscountType(d.discountType ?? null);
          setDiscountAmount(d.discountAmount ?? 0);
          setDiscountReason(d.discountReason ?? "");
          setServiceCategoryId(d.serviceCategoryId ?? null);
          setBundleServices(d.bundleServices ?? []);
          setBillToId(d.billToId ?? null);
          setProducts(d.products ?? []);
          setShowNewType(false); setNewTypeName(""); setShowNewEditType(false); setNewEditTypeName("");
          setShowNewLocation(false); setNewLocForm({ name: "", address: "", city: "", state: "TN", zip: "", oneTimeUse: false });
          setLocationTab("saved"); setShowNewClient(false); setNewClientName("");
          setShowNewAgent(false); setNewAgentName("");
          wasOpen.current = open;
          return;
        }
      }
      // If editing a shoot whose client is an agent, enter via that agent's
      // broker so the picker shows broker → agent. New shoots default to the
      // first standard client (brokers/agents are reached via the broker).
      const initClient = data.clients.find(c => c.id === (project?.clientId ?? defaultClientId));
      // Booking for an agent (e.g. clicking an agent on the Brokers page): enter
      // via their broker and turn on the real-estate flow (RE type + bundle +
      // one-time address), same as picking a broker from the client dropdown.
      const bookingAgent = !project && initClient?.clientType === "agent";
      const reType = bookingAgent ? data.projectTypes.find(t => /real\s*estate/i.test(t.name)) : undefined;
      const reCat = bookingAgent ? data.serviceCategories.find(c => /real\s*estate/i.test(c.name)) : undefined;
      setBrokerSelectId(initClient?.clientType === "agent" ? (initClient.brokerId ?? "") : "");
      setShowNewAgent(false);
      setNewAgentName("");
      setClientId(project?.clientId ?? defaultClientId ?? data.clients.find(c => (c.clientType ?? "standard") === "standard")?.id ?? "");
      setProjectTypeId(project?.projectTypeId ?? reType?.id ?? "");
      setLocationId(project?.locationId ?? "");
      // Prefill the RE address field from the project's location (if any).
      const initLoc = data.locations.find(l => l.id === project?.locationId);
      setPropertyAddress(initLoc ? (initLoc.address || initLoc.name || "") : "");
      setDate(project?.date ?? defaultDate ?? "");
      setStartTime(project?.startTime ?? defaultStartTime ?? "09:00");
      setEndTime(project?.endTime ?? "11:00");
      setStatus(project?.status ?? "upcoming");
      // Default crew/editor pay to the live Services flat rate for real-estate
      // shoots — fills rows that are hourly or have no flat amount yet (so an
      // existing shoot picks up rates set after it was booked), leaving any
      // explicit flat override untouched.
      const reRates = roleRatesFromSelections(project?.services ?? []);
      const fillRate = <T extends ProjectCrewEntry | ProjectPostEntry>(e: T, total: number): T =>
        (total > 0 && !Number(e.flatAmount) && (e.payType ?? "hourly") === "hourly")
          ? { ...e, payType: "flat", flatAmount: total } : e;
      setCrew((project?.crew?.length ? project.crew : initialCrew(defaultCrewMemberId)).map(e => fillRate(e, reRates.shoot)));
      setPostProduction((project?.postProduction?.length ? project.postProduction : [emptyPostEntry()]).map(e => fillRate(e, reRates.edit)));
      setEditTypes(project?.editTypes ?? []);
      setNotes(project?.notes ?? "");
      setDeliverableUrl(project?.deliverableUrl ?? "");
      setCancellationReason(project?.cancellationReason ?? "");
      // For new projects, pre-fill project rate from client default
      if (project?.projectRate != null) {
        setProjectRate(project.projectRate);
      } else if (!project) {
        const client = data.clients.find(c => c.id === (defaultClientId ?? data.clients[0]?.id));
        if (client?.billingModel === "per_project") {
          setProjectRate(client.perProjectRate || 0);
        } else {
          setProjectRate(null);
        }
      } else {
        setProjectRate(null);
      }
      setBillingModelOverride(project?.billingModel ?? null);
      setBillingRateOverride(project?.billingRate ?? null);
      setDiscountType(project?.discountType ?? null);
      setDiscountAmount(project?.discountAmount ?? 0);
      setDiscountReason(project?.discountReason ?? "");
      setServiceCategoryId(project?.serviceCategoryId ?? reCat?.id ?? null);
      setBundleServices(project?.services ?? []);
      setBillToId(project?.billToId ?? null);
      setProducts(project?.products ?? []);
      setShowNewType(false);
      setNewTypeName("");
      setShowNewEditType(false);
      setNewEditTypeName("");
      setShowNewLocation(false);
      setNewLocForm({ name: "", address: "", city: "", state: "TN", zip: "", oneTimeUse: false });
      setLocationTab(bookingAgent ? "one-time" : "saved");
      setShowNewClient(false);
      setNewClientName("");
    }
    wasOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project, defaultDate, defaultClientId, defaultStartTime, defaultCrewMemberId, data.clients, resume]);

  // Snapshot the current form for the "Resume Project" draft.
  const captureDraft = () => ({
    brokerSelectId, clientId, projectTypeId, locationId, propertyAddress,
    date, startTime, endTime, status, crew, postProduction, editTypes, notes,
    deliverableUrl, cancellationReason, projectRate, billingModelOverride,
    billingRateOverride, discountType, discountAmount, discountReason,
    serviceCategoryId, bundleServices, billToId, products,
  });
  const draftMeaningful = (d: ReturnType<typeof captureDraft>) =>
    !!(d.projectTypeId || d.brokerSelectId || d.propertyAddress.trim() || d.notes.trim()
      || d.bundleServices.length || d.products.length || d.deliverableUrl.trim()
      || d.crew.some(c => c.crewMemberId) || d.postProduction.some(c => c.crewMemberId));

  // Close path used by Cancel / back. For a new project that's been started,
  // stash the draft so it can be resumed; otherwise leave any existing draft.
  const handleCloseWithDraft = () => {
    if (!isEdit) {
      try {
        const d = captureDraft();
        if (draftMeaningful(d)) localStorage.setItem(PROJECT_DRAFT_KEY, JSON.stringify(d));
      } catch { /* ignore */ }
    }
    onClose();
  };

  const toggleEditType = (id: string) => {
    setEditTypes((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const handleSaveNewEditType = async () => {
    if (!newEditTypeName.trim()) return;
    try {
      // New edit types are scoped to the client you're working with, so a
      // real-estate edit doesn't show up on weddings/photography and vice versa.
      const et = await addEditType({ name: newEditTypeName.trim(), appliesTo: editTypeScope });
      setEditTypes((prev) => [...prev, et.id]);
      setShowNewEditType(false);
      setNewEditTypeName("");
      toast.success("Edit type created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create edit type");
    }
  };

  // Get the selected client and check if selected type is lightweight
  const selectedClient = useMemo(() => data.clients.find(c => c.id === clientId), [data.clients, clientId]);

  // Edit types are scoped to the client type (same idea as service bundles):
  // real-estate shoots show real-estate edits, photography shows photography
  // edits, etc. "any"-scoped edits show everywhere. Already-selected ones always
  // show so an existing project never loses its edits.
  const editTypeScope: "real_estate" | "wedding" | "photography" = (() => {
    const ct = selectedClient?.clientType ?? "standard";
    if (ct === "broker" || ct === "agent") return "real_estate";
    if (ct === "photography") return "photography";
    return "wedding";
  })();
  const visibleEditTypes = useMemo(
    () => data.editTypes.filter(et => {
      const scope = et.appliesTo ?? "any";
      return scope === "any" || scope === editTypeScope || editTypes.includes(et.id);
    }),
    [data.editTypes, editTypeScope, editTypes],
  );

  // Real-estate shoot: the selected project type's name matches "real estate".
  // Drives the streamlined flow (address field, start-time only, auto bundle).
  const isRealEstate = useMemo(
    () => /real\s*estate/i.test(data.projectTypes.find(t => t.id === projectTypeId)?.name || ""),
    [data.projectTypes, projectTypeId],
  );
  const isLightweight = useMemo(() => data.projectTypes.find(pt => pt.id === projectTypeId)?.lightweight || false, [data.projectTypes, projectTypeId]);

  // Real-estate flat crew rates: each picked service piece tagged "Pays: Shooter/
  // Editor" carries a flat payout (set in Manage → Services). Read it LIVE from
  // the service definitions (not the project's snapshot) so existing shoots pick
  // up rates set after they were booked. Shooters get the shoot total, editors
  // the edit total — auto-filled into the crew rows as an editable default.
  const roleRatesFromSelections = useCallback((sels: ProjectServiceSelection[]) => {
    let shoot = 0, edit = 0;
    for (const sel of sels || []) {
      const svc = data.services.find(s => s.id === sel.serviceId);
      if (!svc?.crewRole) continue;
      const variant = sel.variantId ? data.serviceVariants.find(v => v.id === sel.variantId) : null;
      const cost = variant && variant.cost != null ? Number(variant.cost) : Number(svc.defaultCost ?? 0);
      if (svc.crewRole === "shoot") shoot += cost;
      else if (svc.crewRole === "edit") edit += cost;
    }
    return { shoot, edit };
  }, [data.services, data.serviceVariants]);
  const serviceRoleRates = useMemo(() => roleRatesFromSelections(bundleServices), [roleRatesFromSelections, bundleServices]);

  // Photo gallery for this shoot (upload → deliver). Linked by project id.
  const [, setLocation] = useLocation();
  const [creatingGallery, setCreatingGallery] = useState(false);
  const projectGallery = useMemo(() => data.deliveries.find(d => d.projectId === project?.id), [data.deliveries, project?.id]);
  const openOrCreateGallery = async () => {
    if (!project) return;
    if (projectGallery) { onClose(); setLocation(`/deliveries/${projectGallery.id}`); return; }
    setCreatingGallery(true);
    try {
      const name = propertyAddress.trim() || data.locations.find(l => l.id === locationId)?.name || selectedClient?.company || "Shoot";
      const g = await createReShootGallery(project.id, name);
      onClose();
      if (g) setLocation(`/deliveries/${g.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open the gallery");
    } finally {
      setCreatingGallery(false);
    }
  };

  // Pick photos and upload them straight into this shoot's gallery (no leaving).
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPhotos, setUploadingPhotos] = useState<{ done: number; total: number } | null>(null);
  async function handleAddPhotos(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || !project) return;
    const list = Array.from(fileList);
    let gallery = projectGallery;
    if (!gallery) {
      try {
        const name = propertyAddress.trim() || data.locations.find(l => l.id === locationId)?.name || selectedClient?.company || "Shoot";
        gallery = (await createReShootGallery(project.id, name)) ?? undefined;
      } catch { /* surfaced below */ }
    }
    if (!gallery) { toast.error("Couldn't open the gallery"); return; }
    const gid = gallery.id;
    const token = await getAuthToken();
    const startPos = data.deliveryFiles.filter(f => f.deliveryId === gid).length;
    setUploadingPhotos({ done: 0, total: list.length });
    let done = 0, failed = 0;
    for (const rawFile of list) {
      try {
        // iPhone HEIC → JPEG so it displays; full quality, full resolution.
        const file = await toUploadableImage(rawFile);
        const isVideo = file.type.startsWith("video/");
        const { width, height } = await readImageDims(file);
        const up = await fetch("/api/delivery-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ deliveryId: gid, fileName: file.name, contentType: file.type, sizeBytes: file.size }),
        });
        const upData = await up.json();
        if (!up.ok) throw new Error(upData.error || "Upload failed");
        const put = await fetch(upData.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!put.ok) throw new Error(`Upload failed (${put.status})`);
        await registerDeliveryFile({
          deliveryId: gid, storagePath: upData.storagePath, originalName: file.name, sizeBytes: file.size,
          width, height, mimeType: file.type, position: startPos + done,
          mediaType: isVideo ? "video" : "image", thumbnailStoragePath: "", durationSeconds: null,
        });
        done++;
      } catch (e) {
        failed++;
        toast.error(`Failed: ${rawFile.name}`, { description: e instanceof Error ? e.message : "Try again" });
      }
      setUploadingPhotos({ done: done + failed, total: list.length });
    }
    setUploadingPhotos(null);
    if (done > 0) toast.success(`Added ${done} photo${done === 1 ? "" : "s"} to the gallery`);
  }

  // Availability of each crew member for THIS shoot's date/time, shown in the
  // assign-crew picker (available / busy / off). End mirrors start for RE.
  const crewPrefsMap = useMemo(() => {
    const m: Record<string, { bufferMinutes: number }> = {};
    for (const p of data.shooterPrefs) m[p.crewMemberId] = { bufferMinutes: p.bufferMinutes };
    return m;
  }, [data.shooterPrefs]);
  const crewStatus = useCallback((crewMemberId: string) => {
    if (!date || !startTime) return null;
    const end = isRealEstate ? addMinutesT(startTime, shootDurationMinFor(crewMemberId, data.shooterPrefs)) : (endTime || startTime);
    return getCrewShootStatus(crewMemberId, date, startTime, end, data.projects, data.availability, crewPrefsMap, project?.id);
     
  }, [date, startTime, endTime, isRealEstate, data.projects, data.availability, data.shooterPrefs, crewPrefsMap, project?.id]);
  const STATUS_TAG: Record<string, string> = { available: " · ✓ available", busy: " · busy", off: " · off" };

  const availableProjectTypes = useMemo(() => {
    // A per-client allow-list wins (explicit override).
    if (selectedClient?.allowedProjectTypeIds?.length) {
      return data.projectTypes.filter(pt => selectedClient.allowedProjectTypeIds.includes(pt.id));
    }
    // Otherwise scope by the client TYPE (real estate / wedding / photography),
    // set in Manage → Project Types. Always keep the project's current type so
    // an edit never loses it.
    return data.projectTypes.filter(pt => {
      const scope = pt.appliesTo ?? "any";
      return scope === "any" || scope === editTypeScope || pt.id === projectTypeId;
    });
  }, [data.projectTypes, selectedClient, editTypeScope, projectTypeId]);

  // When client changes, auto-select default project type and pre-fill project rate
  const handleClientChange = (newClientId: string) => {
    setClientId(newClientId);
    const client = data.clients.find(c => c.id === newClientId);
    if (client?.defaultProjectTypeId) {
      setProjectTypeId(client.defaultProjectTypeId);
    } else {
      setProjectTypeId("");
    }
    if (client?.billingModel === "per_project") {
      setProjectRate(client.perProjectRate || 0);
    } else {
      setProjectRate(null);
    }
  };

  // Top client dropdown lists standard clients + brokers. Picking a broker
  // doesn't set the project's client — it reveals the agent picker below.
  const handleClientDropdown = (v: string) => {
    const c = data.clients.find(x => x.id === v);
    if (c?.clientType === "broker") {
      setBrokerSelectId(v);
      setClientId("");           // wait for an agent
      setShowNewAgent(false);
      // A broker shoot is a real-estate shoot — auto-select that type so the
      // bundle + address + start-time-only flow turns on without extra clicks.
      const reType = data.projectTypes.find(t => /real\s*estate/i.test(t.name));
      if (reType) handleProjectTypeChange(reType.id);
    } else {
      setBrokerSelectId("");
      handleClientChange(v);     // standard client → it's the project's client
    }
  };

  // Picking an agent sets the project's client to that agent (bill-to resolves
  // to their broker). Does NOT touch the project type — the owner usually picks
  // "Real Estate Shoot" before the agent.
  const handleAgentChange = (agentId: string) => {
    setClientId(agentId);
    const agent = data.clients.find(c => c.id === agentId);
    setProjectRate(agent?.billingModel === "per_project" ? (agent.perProjectRate || 0) : null);
  };

  const handleSaveNewAgent = async () => {
    const name = newAgentName.trim();
    if (!name || !brokerSelectId) return;
    try {
      const agent = await addClient({
        company: name, contactName: "", phone: "", email: "",
        address: "", city: "", state: "", zip: "",
        billingModel: "per_project", billingRatePerHour: 0, perProjectRate: 0,
        projectTypeRates: [], allowedProjectTypeIds: [], defaultProjectTypeId: "",
        roleBillingMultipliers: [], clientType: "agent", brokerId: brokerSelectId,
      });
      setClientId(agent.id);
      setShowNewAgent(false);
      setNewAgentName("");
    } catch (err: any) {
      toast.error(err.message || "Failed to add agent");
    }
  };

  // When project type changes for per_project clients, check for type-specific rate
  const handleProjectTypeChange = (newTypeId: string) => {
    setProjectTypeId(newTypeId);
    if (selectedClient?.billingModel === "per_project") {
      const typeRate = selectedClient.projectTypeRates?.find(r => r.projectTypeId === newTypeId);
      if (typeRate) {
        setProjectRate(typeRate.rate);
      } else if (!isEdit) {
        setProjectRate(selectedClient.perProjectRate || 0);
      }
    }
    // Real-estate shoot: auto-open the matching service bundle and default the
    // location to a one-time street address (each house is unique).
    const typeName = data.projectTypes.find(t => t.id === newTypeId)?.name || "";
    if (/real\s*estate/i.test(typeName)) {
      if (!serviceCategoryId) {
        const reCat = data.serviceCategories.find(c => /real\s*estate/i.test(c.name));
        if (reCat) { setServiceCategoryId(reCat.id); setBundleServices([]); }
      }
      setLocationTab("one-time");
    }
  };

  // Filtered location lists for tabs
  const savedLocations = useMemo(() => data.locations.filter(l => !l.oneTimeUse), [data.locations]);
  const oneTimeLocations = useMemo(() => data.locations.filter(l => l.oneTimeUse), [data.locations]);

  // Inline create: save new client
  const handleSaveNewClient = async () => {
    if (!newClientName.trim()) return;
    try {
      const newClient = await addClient({
        company: newClientName.trim(),
        contactName: "",
        phone: "",
        email: "",
        address: "",
        city: "",
        state: "",
        zip: "",
        billingModel: "hourly",
        billingRatePerHour: 0,
        perProjectRate: 0,
        projectTypeRates: [],
        allowedProjectTypeIds: [],
        defaultProjectTypeId: "",
        roleBillingMultipliers: [],
      });
      setBrokerSelectId("");
      setClientId(newClient.id);
      setProjectTypeId("");
      setProjectRate(null);
      setShowNewClient(false);
      setNewClientName("");
      toast.success("Client created");
    } catch (err: any) {
      toast.error(err.message || "Failed to create client");
    }
  };

  // Inline create: save new project type
  const handleSaveNewType = async () => {
    if (!newTypeName.trim()) return;
    try {
      const pt = await addProjectType({ name: newTypeName.trim(), lightweight: false });
      handleProjectTypeChange(pt.id);
      setShowNewType(false);
      setNewTypeName("");
      toast.success("Project type created");
    } catch (err: any) {
      toast.error(err.message || "Failed to create type");
    }
  };

  // Inline create: save new location
  const handleSaveNewLocation = async () => {
    if (!newLocForm.name.trim() || !newLocForm.address.trim()) {
      toast.error("Name and address are required");
      return;
    }
    try {
      const loc = await addLocation(newLocForm);
      setLocationId(loc.id);
      if (loc.oneTimeUse) setLocationTab("one-time");
      setShowNewLocation(false);
      setNewLocForm({ name: "", address: "", city: "", state: "TN", zip: "", oneTimeUse: false });
      toast.success("Location created");
    } catch (err: any) {
      toast.error(err.message || "Failed to create location");
    }
  };

  // Inline create: save new crew member from within the crew/post-production rows
  const handleSaveNewCrew = async () => {
    const name = newCrewName.trim();
    if (!name || !quickAddCrew) return;
    try {
      const member = await addCrewMember({
        name,
        roleRates: [],
        phone: "",
        email: "",
        defaultPayRatePerHour: 0,
        homeAddress: null,
      });
      if (quickAddCrew.section === "crew") {
        updateCrewEntry(quickAddCrew.idx, "crewMemberId", member.id);
      } else {
        updatePostEntry(quickAddCrew.idx, "crewMemberId", member.id);
      }
      setQuickAddCrew(null);
      setNewCrewName("");
      toast.success("Crew member added");
    } catch (err: any) {
      toast.error(err.message || "Failed to add crew member");
    }
  };

  // Promote one-time location to saved
  const handlePromoteLocation = async (locId: string) => {
    try {
      await updateLocation(locId, { oneTimeUse: false });
      setLocationTab("saved");
      toast.success("Moved to saved locations");
    } catch (err: any) {
      toast.error(err.message || "Failed to update location");
    }
  };

  // When a crew member is selected, reset role and rate; when role is selected, auto-fill rate from staff profile
  const updateCrewEntry = (idx: number, field: keyof ProjectCrewEntry, value: string | number) => {
    setCrew((prev) => prev.map((e, i) => {
      if (i !== idx) return e;
      const updated = { ...e, [field]: value };
      if (field === "crewMemberId") {
        // Reset role and rate when person changes
        updated.role = "";
        updated.payRatePerHour = 0;
        // Real-estate flat rate: default this shooter's pay to the Services rate.
        if (value && serviceRoleRates.shoot > 0) { updated.payType = "flat"; updated.flatAmount = serviceRoleRates.shoot; }
      }
      if (field === "role") {
        // Auto-fill pay rate from staff profile for the selected role
        const member = data.crewMembers.find(c => c.id === e.crewMemberId);
        const rr = member?.roleRates?.find(r => r.role === value);
        if (rr) updated.payRatePerHour = rr.payRatePerHour;
      }
      return updated;
    }));
  };

  const updatePostEntry = (idx: number, field: keyof ProjectPostEntry, value: string | number) => {
    setPostProduction((prev) => prev.map((e, i) => {
      if (i !== idx) return e;
      const updated = { ...e, [field]: value };
      if (field === "crewMemberId") {
        updated.role = "";
        updated.payRatePerHour = 0;
        // Real-estate flat rate: default this editor's pay to the Services rate.
        if (value && serviceRoleRates.edit > 0) { updated.payType = "flat"; updated.flatAmount = serviceRoleRates.edit; }
      }
      if (field === "role") {
        const member = data.crewMembers.find(c => c.id === e.crewMemberId);
        const rr = member?.roleRates?.find(r => r.role === value);
        if (rr) updated.payRatePerHour = rr.payRatePerHour;
      }
      return updated;
    }));
  };

  const handleSave = async () => {
    if (brokerSelectId && !clientId) {
      toast.error("Select an agent for this broker");
      return;
    }
    if (!clientId || !date || !projectTypeId) {
      toast.error("Please fill in client, project type, and date");
      return;
    }
    if (isRealEstate && !propertyAddress.trim()) {
      toast.error("Enter the property address");
      return;
    }
    // SaaS tier gate: block new project creation when over plan limit.
    // Existing projects (edit path) are always allowed — data preserved on downgrade.
    if (!isEdit) {
      const state = getProjectLimitState(data.organization, data.projects.length);
      if (!state.allowNew) {
        setShowUpgrade(true);
        return;
      }
    }
    // Real-estate: turn the typed address into a one-time location (reusing the
    // project's existing one if it already has one). End time mirrors start.
    let finalLocationId = locationId;
    try {
      if (isRealEstate) {
        const addr = propertyAddress.trim();
        const existingOneTime = data.locations.find(l => l.id === locationId && l.oneTimeUse);
        if (existingOneTime) {
          await updateLocation(existingOneTime.id, { name: addr, address: addr });
          finalLocationId = existingOneTime.id;
        } else {
          const loc = await addLocation({ name: addr, address: addr, city: "", state: "", zip: "", oneTimeUse: true });
          finalLocationId = loc.id;
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save the property address");
      return;
    }
    // Real-estate shoots block start + the assigned shooter's length (shoot +
    // travel buffer, default 90 min) instead of a 0-minute 9:00–9:00 window.
    const reCrewId = crew.find((c) => c.crewMemberId)?.crewMemberId;
    const reEnd = startTime ? addMinutesT(startTime, shootDurationMinFor(reCrewId, data.shooterPrefs)) : startTime;
    const payload: Omit<Project, "id" | "createdAt"> = {
      clientId, projectTypeId, locationId: finalLocationId || "", date, startTime, endTime: isRealEstate ? reEnd : endTime,
      status: isLightweight ? "delivered" : status,
      crew: crew.filter((c) => c.crewMemberId),
      postProduction: postProduction.filter((c) => c.crewMemberId),
      editorBilling: project?.editorBilling ?? null,
      projectRate: selectedClient?.billingModel === "per_project" ? projectRate : null,
      billingModel: billingModelOverride,
      billingRate: billingModelOverride ? billingRateOverride : null,
      editTypes, notes, deliverableUrl,
      cancellationReason: status === "cancelled" ? cancellationReason.trim() : "",
      cancelledAt: status === "cancelled" ? (project?.cancelledAt ?? null) : null,
      discountType: discountAmount > 0 ? discountType : null,
      discountAmount: discountAmount > 0 ? discountAmount : 0,
      discountReason: discountReason.trim(),
      serviceCategoryId: serviceCategoryId || null,
      services: bundleServices,
      billToId: billToId || null,
      products,
    };
    // Notify flagged crew to confirm availability (only if the org uses it).
    const notifyConfirm = async (pid: string) => {
      if (!data.crewMembers.some(c => c.requiresShootConfirmation)) return;
      try {
        const token = await getAuthToken();
        await fetch("/api/notify-shoot-confirmations", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ projectId: pid }),
        });
      } catch { /* non-fatal */ }
    };
    try {
      if (isEdit && project) {
        await updateProject(project.id, payload);
        void notifyConfirm(project.id);
        toast.success("Project updated");
      } else {
        const newProject = await addProject(payload);
        // Real-estate shoots get a private gallery auto-created for uploads.
        if (isRealEstate) {
          try { await createReShootGallery(newProject.id, propertyAddress.trim()); } catch { /* non-fatal */ }
        }
        void notifyConfirm(newProject.id);
        try { localStorage.removeItem(PROJECT_DRAFT_KEY); } catch { /* ignore */ }
        toast.success("Project created");
        if (onCreated) onCreated(newProject);
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save project");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        // Don't lose a half-entered project to an accidental backdrop click or
        // stray Escape — closing is deliberate (Cancel / back button only).
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="fixed !inset-0 !top-0 !left-0 !translate-x-0 !translate-y-0 !max-w-none !w-full !rounded-none overflow-hidden flex flex-col bg-card border-border text-foreground sm:!inset-auto sm:!top-[50%] sm:!left-[50%] sm:!translate-x-[-50%] sm:!translate-y-[-50%] sm:!w-[calc(100vw-2rem)] sm:!max-w-[900px] sm:!h-auto sm:!max-h-[90dvh] sm:!rounded-lg"
        style={{
          height: "100%",
          maxHeight: "100%",
          overflow: "hidden",
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCloseWithDraft}
              className="sm:hidden -ml-1 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {isEdit ? "Edit Project" : "New Project"}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 flex-1 min-h-0 overflow-y-auto overflow-x-hidden" style={{ WebkitOverflowScrolling: "touch" }}>
          {/* Row 1: Client + Project Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Client</Label>
              {showNewClient ? (
                <div className="flex gap-2">
                  <Input
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveNewClient()}
                    className="bg-secondary border-border"
                    placeholder="Client name"
                    autoFocus
                  />
                  <Button size="sm" onClick={handleSaveNewClient} className="bg-primary text-primary-foreground shrink-0 h-9">Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowNewClient(false); setNewClientName(""); }} className="shrink-0 h-9">Cancel</Button>
                </div>
              ) : (
                <Select value={brokerSelectId || clientId} onValueChange={(v) => { if (v === "__new__") { setShowNewClient(true); } else { handleClientDropdown(v); } }}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="Select client or broker" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {(() => {
                      // Group the picker by client type so a long list reads as
                      // tidy sections. (Radix Select also supports type-to-jump.)
                      const nonAgent = data.clients.filter((c) => (c.clientType ?? "standard") !== "agent");
                      const brokers = nonAgent.filter((c) => c.clientType === "broker");
                      const photography = nonAgent.filter((c) => c.clientType === "photography");
                      const others = nonAgent.filter((c) => { const t = c.clientType ?? "standard"; return t !== "broker" && t !== "photography"; });
                      const section = (label: string, list: typeof nonAgent) => list.length > 0 ? (
                        <SelectGroup>
                          <SelectLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</SelectLabel>
                          {list.map((c) => <SelectItem key={c.id} value={c.id}>{c.company}</SelectItem>)}
                        </SelectGroup>
                      ) : null;
                      return (
                        <>
                          {section("Real Estate", brokers)}
                          {section("Photography", photography)}
                          {section("Other Clients", others)}
                        </>
                      );
                    })()}
                    <SelectItem value="__new__" className="text-primary font-medium">
                      <span className="flex items-center gap-1"><Plus className="w-3 h-3" /> New Client</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
              {/* Agent picker — appears when a broker is chosen above. */}
              {brokerSelectId && !showNewClient && (
                <div className="mt-2 space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Agent</Label>
                  {showNewAgent ? (
                    <div className="flex gap-2">
                      <Input
                        value={newAgentName}
                        onChange={(e) => setNewAgentName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSaveNewAgent()}
                        className="bg-secondary border-border"
                        placeholder="Agent name"
                        autoFocus
                      />
                      <Button size="sm" onClick={handleSaveNewAgent} className="bg-primary text-primary-foreground shrink-0 h-9">Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setShowNewAgent(false); setNewAgentName(""); }} className="shrink-0 h-9">Cancel</Button>
                    </div>
                  ) : (
                    <Select value={clientId} onValueChange={(v) => { if (v === "__newagent__") { setShowNewAgent(true); } else { handleAgentChange(v); } }}>
                      <SelectTrigger className="bg-secondary border-border">
                        <SelectValue placeholder="Select agent" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {data.clients
                          .filter((c) => c.clientType === "agent" && c.brokerId === brokerSelectId)
                          .map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.company}{a.contactName && a.contactName !== a.company ? ` · ${a.contactName}` : ""}</SelectItem>
                          ))}
                        <SelectItem value="__newagent__" className="text-primary font-medium">
                          <span className="flex items-center gap-1"><Plus className="w-3 h-3" /> New Agent</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {selectedClient?.clientType === "agent" && (selectedClient.email || selectedClient.phone) && (
                    <p className="text-[11px] text-muted-foreground">{[selectedClient.email, formatPhoneDisplay(selectedClient.phone)].filter(Boolean).join(" · ")} · bills to broker</p>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Project Type</Label>
              {showNewType ? (
                <div className="flex gap-2">
                  <Input
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveNewType()}
                    className="bg-secondary border-border"
                    placeholder="Type name"
                    autoFocus
                  />
                  <Button size="sm" onClick={handleSaveNewType} className="bg-primary text-primary-foreground shrink-0 h-9">Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowNewType(false); setNewTypeName(""); }} className="shrink-0 h-9">Cancel</Button>
                </div>
              ) : (
                <Select value={projectTypeId} onValueChange={(v) => { if (v === "__new__") { setShowNewType(true); } else { handleProjectTypeChange(v); } }}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {availableProjectTypes.map((pt) => (
                      <SelectItem key={pt.id} value={pt.id}>{pt.name}</SelectItem>
                    ))}
                    <SelectItem value="__new__" className="text-primary font-medium">
                      <span className="flex items-center gap-1"><Plus className="w-3 h-3" /> New Type</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Row 2: Date + Times. Real-estate shoots show start time only. Time
              uses styled selects (native time inputs overflow on iOS); min-w-0
              lets the grid columns shrink so nothing bleeds past the edge. */}
          <div className={`grid grid-cols-1 ${isRealEstate ? "sm:grid-cols-2" : "sm:grid-cols-3"} gap-4`}>
            <div className="space-y-1.5 min-w-0">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <DateField value={date} onChange={setDate} className="bg-secondary border-border w-full min-w-0" />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label className="text-xs text-muted-foreground">Start Time</Label>
              <select value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full h-9 rounded-md border border-border bg-secondary px-3 text-sm text-foreground">
                {timeOptionsWith(startTime).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {!isRealEstate && (
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs text-muted-foreground">End Time</Label>
                <select value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full h-9 rounded-md border border-border bg-secondary px-3 text-sm text-foreground">
                  {timeOptionsWith(endTime).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Row 3: Location/Address + Status */}
          <div className={`grid grid-cols-1 ${isLightweight ? "" : "sm:grid-cols-2"} gap-4`}>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{isRealEstate ? "Property Address" : "Location"}</Label>
              {isRealEstate ? (
                <>
                  <Input
                    value={propertyAddress}
                    onChange={(e) => setPropertyAddress(e.target.value)}
                    className="bg-secondary border-border"
                    placeholder="123 Main St, Nashville, TN"
                  />
                  <p className="text-[11px] text-muted-foreground">Saved with this shoot only — not added to your locations list.</p>
                </>
              ) : showNewLocation ? (
                <div className="space-y-2 rounded-md border border-border p-3 bg-secondary/30">
                  <Input value={newLocForm.name} onChange={(e) => setNewLocForm(f => ({ ...f, name: e.target.value }))} className="bg-secondary border-border" placeholder="Location name *" autoFocus />
                  <Input value={newLocForm.address} onChange={(e) => setNewLocForm(f => ({ ...f, address: e.target.value }))} className="bg-secondary border-border" placeholder="Street address *" />
                  <div className="grid grid-cols-3 gap-2">
                    <Input value={newLocForm.city} onChange={(e) => setNewLocForm(f => ({ ...f, city: e.target.value }))} className="bg-secondary border-border" placeholder="City" />
                    <Input value={newLocForm.state} onChange={(e) => setNewLocForm(f => ({ ...f, state: e.target.value }))} className="bg-secondary border-border" placeholder="State" />
                    <Input value={newLocForm.zip} onChange={(e) => setNewLocForm(f => ({ ...f, zip: e.target.value }))} className="bg-secondary border-border" placeholder="ZIP" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="oneTimeUse" checked={newLocForm.oneTimeUse} onCheckedChange={(v) => setNewLocForm(f => ({ ...f, oneTimeUse: !!v }))} />
                    <label htmlFor="oneTimeUse" className="text-xs text-muted-foreground cursor-pointer">One-time use</label>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => { setShowNewLocation(false); setNewLocForm({ name: "", address: "", city: "", state: "TN", zip: "", oneTimeUse: false }); }}>Cancel</Button>
                    <Button size="sm" onClick={handleSaveNewLocation} className="bg-primary text-primary-foreground">Save Location</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex gap-1 mb-1">
                    <button
                      onClick={() => setLocationTab("saved")}
                      className={`px-2.5 py-1 rounded text-xs border transition-colors ${locationTab === "saved" ? "bg-primary/20 border-primary/50 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}
                    >
                      Saved ({savedLocations.length})
                    </button>
                    <button
                      onClick={() => setLocationTab("one-time")}
                      className={`px-2.5 py-1 rounded text-xs border transition-colors ${locationTab === "one-time" ? "bg-primary/20 border-primary/50 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}
                    >
                      One-Time ({oneTimeLocations.length})
                    </button>
                  </div>
                  <Select value={locationId} onValueChange={(v) => { if (v === "__new__") { setShowNewLocation(true); } else { setLocationId(v); } }}>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {(locationTab === "saved" ? savedLocations : oneTimeLocations).map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          <span className="flex items-center gap-2">
                            {l.name}
                            {l.oneTimeUse && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handlePromoteLocation(l.id); }}
                                className="text-primary hover:text-primary/80 ml-auto"
                                title="Save to Locations"
                              >
                                <Save className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                      {locationTab === "saved" && savedLocations.length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">No saved locations</div>
                      )}
                      {locationTab === "one-time" && oneTimeLocations.length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">No one-time locations</div>
                      )}
                      <SelectItem value="__new__" className="text-primary font-medium">
                        <span className="flex items-center gap-1"><Plus className="w-3 h-3" /> New Location</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {!isLightweight && <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <div className="flex flex-wrap gap-1">
                {[
                  { v: "tentative", l: "Tentative" },
                  { v: "upcoming", l: "Upcoming" },
                  { v: "filming_done", l: "Filmed" },
                  { v: "in_editing", l: "In Editing" },
                  { v: "editing_done", l: "Editing Done" },
                  { v: "delivered", l: "Delivered" },
                  { v: "cancelled", l: "Cancelled" },
                ].map(opt => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setStatus(opt.v as ProjectStatus)}
                    className={`px-2.5 py-1.5 rounded-md text-xs border transition-colors ${
                      status === opt.v
                        ? "bg-primary/20 border-primary/50 text-primary font-medium"
                        : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    }`}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>}
          </div>

          {/* Cancellation reason — surfaces only when status is cancelled.
              Saved alongside cancelled_at; shown read-only on the project
              detail so future viewers can see why this didn't go forward. */}
          {!isLightweight && status === "cancelled" && (
            <div className="space-y-1.5 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
              <Label className="text-xs font-medium text-red-300">Reason for cancellation</Label>
              <Textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Why was this project cancelled? (e.g. client postponed, weather, scope changed)"
                className="bg-background/50 border-red-500/30 resize-none"
                rows={2}
              />
              {project?.cancelledAt && (
                <p className="text-[10px] text-muted-foreground">Cancelled on {new Date(project.cancelledAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
              )}
            </div>
          )}

          {/* Project Rate (per-project billing clients only, legacy field) */}
          {!isLightweight && selectedClient?.billingModel === "per_project" && !billingModelOverride && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Project Rate ($)</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={projectRate ?? ""}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^\d.]/g, "");
                  setProjectRate(cleaned === "" ? 0 : parseFloat(cleaned) || 0);
                }}
                className="bg-secondary border-border"
                placeholder="e.g. 300"
              />
              <p className="text-[10px] text-muted-foreground">
                Flat rate billed to client for this project. Crew entries below are for internal cost tracking only.
              </p>
            </div>
          )}

          {/* Billing override — works for any client */}
          {!isLightweight && selectedClient && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Billing Mode</Label>
              <Select
                value={billingModelOverride ?? "inherit"}
                onValueChange={(v) => {
                  if (v === "inherit") {
                    setBillingModelOverride(null);
                    setBillingRateOverride(null);
                  } else {
                    const mode = v as BillingModel;
                    setBillingModelOverride(mode);
                    if (billingRateOverride == null) {
                      setBillingRateOverride(mode === "hourly"
                        ? Number(selectedClient.billingRatePerHour || 0)
                        : Number(selectedClient.perProjectRate || 0));
                    }
                  }
                }}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="inherit">Use client default</SelectItem>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="per_project">Per project (flat)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Client default: {selectedClient.billingModel === "per_project"
                  ? `Per project @ $${Number(selectedClient.perProjectRate || 0).toFixed(0)}`
                  : `Hourly @ $${Number(selectedClient.billingRatePerHour || 0).toFixed(0)}/hr`}
              </p>
              {billingModelOverride && (
                <div className="pt-1">
                  <Label className="text-xs text-muted-foreground">
                    {billingModelOverride === "hourly" ? "Hourly rate ($/hr)" : "Project rate ($)"}
                  </Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={billingRateOverride ?? ""}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^\d.]/g, "");
                      setBillingRateOverride(cleaned === "" ? 0 : parseFloat(cleaned) || 0);
                    }}
                    className="bg-secondary border-border"
                    placeholder={billingModelOverride === "hourly" ? "e.g. 150" : "e.g. 500"}
                  />
                </div>
              )}
            </div>
          )}

          {/* Crew (Filming) */}
          {!isLightweight && <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Crew — Filming / Photography</Label>
              <Button variant="ghost" size="sm" onClick={() => setCrew((p) => [...p, emptyCrewEntry()])} className="h-7 text-xs gap-1 text-primary hover:text-primary">
                <Plus className="w-3 h-3" /> Add
              </Button>
            </div>
            <div className="hidden sm:grid grid-cols-[2fr_3fr_75px_60px_80px_28px] gap-2 text-[10px] text-muted-foreground px-0.5 mb-1">
              <span>Person</span><span>Role</span><span>Pay Type</span><span>Hours</span><span>Pay ($)</span><span />
            </div>
            {crew.map((entry, idx) => {
              const member = data.crewMembers.find(c => c.id === entry.crewMemberId);
              const memberBases = member?.homeBases || [];
              const showBasePicker = memberBases.length > 1;
              return (
              <div key={idx} className="flex flex-col gap-2 bg-secondary/40 sm:bg-transparent rounded-lg p-2 sm:p-0 sm:pb-2 sm:border-b sm:border-border/30 sm:last:border-b-0">
              <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[2fr_3fr_75px_60px_80px_28px] sm:gap-2 sm:items-center">
                <div className="flex gap-2 sm:contents min-w-0">
                  <Select
                    value={entry.crewMemberId}
                    onValueChange={(v) => {
                      if (v === "__new_crew__") {
                        setQuickAddCrew({ idx, section: "crew" });
                        setNewCrewName("");
                      } else {
                        updateCrewEntry(idx, "crewMemberId", v);
                      }
                    }}
                  >
                    <SelectTrigger className="bg-secondary border-border h-8 text-xs flex-1 min-w-0">
                      <SelectValue placeholder="Person" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="__new_crew__" className="text-primary font-medium">+ New crew member…</SelectItem>
                      {data.crewMembers.filter(c => !c.archived).map((c) => {
                        const st = crewStatus(c.id);
                        return (
                          <SelectItem key={c.id} value={c.id}>
                            <span className={st === "available" ? "text-emerald-500" : st === "busy" ? "text-amber-500" : st === "off" ? "text-muted-foreground" : ""}>
                              {c.name}{st ? STATUS_TAG[st] : ""}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <Select
                    value={entry.role}
                    onValueChange={(v) => updateCrewEntry(idx, "role", v)}
                    disabled={!entry.crewMemberId}
                  >
                    <SelectTrigger className="bg-secondary border-border h-8 text-xs flex-1 min-w-0">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {(data.crewMembers.find(c => c.id === entry.crewMemberId)?.roleRates ?? []).map((rr) => (
                        <SelectItem key={rr.role} value={rr.role}>{rr.role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Mobile-only trash. On desktop the Trash button below
                      (inside the second sm:contents wrapper) takes col 5
                      of the 5-col grid; this one is hidden so the grid
                      stays aligned with the headers above. */}
                  <button onClick={() => setCrew((p) => p.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive transition-colors shrink-0 sm:hidden">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex gap-2 sm:contents min-w-0">
                  <div className="flex-1 sm:flex-none min-w-0">
                    <Label className="text-[10px] text-muted-foreground sm:hidden">Pay</Label>
                    <select
                      value={entry.payType || "hourly"}
                      onChange={(e) => updateCrewEntry(idx, "payType", e.target.value as "hourly" | "flat")}
                      className="w-full h-8 bg-secondary border border-border rounded px-2 text-xs text-foreground"
                    >
                      <option value="hourly">Hourly</option>
                      <option value="flat">Flat</option>
                    </select>
                  </div>
                  <div className="flex-1 sm:flex-none min-w-0">
                    <Label className="text-[10px] text-muted-foreground sm:hidden">Hours</Label>
                    <Input type="text" inputMode="decimal" placeholder="0" value={crewHoursText[idx] ?? (entry.hoursWorked || "")} onChange={(e) => { let v = e.target.value.replace(/[^\d.]/g, ""); const dot = v.indexOf("."); if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, ""); setCrewHoursText((prev) => ({ ...prev, [idx]: v })); updateCrewEntry(idx, "hoursWorked", v === "" ? 0 : parseFloat(v) || 0); }} className="bg-secondary border-border h-8 text-xs" />
                  </div>
                  <div className="flex-1 sm:flex-none min-w-0">
                    <Label className="text-[10px] text-muted-foreground sm:hidden">{entry.payType === "flat" ? "Flat $" : "Pay/hr ($)"}</Label>
                    {entry.payType === "flat" ? (
                      <Input type="text" inputMode="decimal" placeholder="0.00" value={entry.flatAmount || ""} onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); updateCrewEntry(idx, "flatAmount", v === "" ? 0 : parseFloat(v) || 0); }} className="bg-secondary border-border h-8 text-xs" />
                    ) : (
                      <Input type="text" inputMode="decimal" placeholder="0.00" value={entry.payRatePerHour || ""} onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); updateCrewEntry(idx, "payRatePerHour", v === "" ? 0 : parseFloat(v) || 0); }} className="bg-secondary border-border h-8 text-xs" />
                    )}
                  </div>
                  <button onClick={() => setCrew((p) => p.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive transition-colors hidden sm:block shrink-0 self-end mb-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {/* "Starting from" picker — only renders when the selected
                  crew member has more than one home base. Default is
                  Auto (closest) — Slate picks whichever base is geo-
                  graphically nearest to the project location. User can
                  override by picking a specific base. */}
              {showBasePicker && (() => {
                // Auto-label resolves to the actually-closest base
                // (named) when we have cached distances for this
                // location. Falls back to a generic "closest base"
                // label when distances aren't cached yet.
                const baseName = (b: typeof memberBases[number]) => b.label?.trim() || b.city?.trim() || (b.type === "travel" ? "Travel base" : "Home");
                let closest: typeof memberBases[number] | null = null;
                if (locationId && entry.crewMemberId) {
                  let bestMiles = Infinity;
                  for (const b of memberBases) {
                    const d = data.crewLocationDistances.find(
                      x => x.crewMemberId === entry.crewMemberId && x.homeBaseId === b.id && x.locationId === locationId
                    );
                    if (d && d.distanceMiles < bestMiles) {
                      bestMiles = d.distanceMiles;
                      closest = b;
                    }
                  }
                }
                const autoLabel = closest
                  ? `Auto (${baseName(closest)})`
                  : `Auto (closest base)`;
                return (
                  <div className="space-y-1 pl-2 sm:pl-0 sm:max-w-xs">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Starting from</Label>
                    <Select
                      value={entry.homeBaseId || "__auto__"}
                      onValueChange={(v) => updateCrewEntry(idx, "homeBaseId", v === "__auto__" ? "" : v)}
                    >
                      <SelectTrigger className="bg-secondary border-border h-8 text-xs w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        <SelectItem value="__auto__">{autoLabel}</SelectItem>
                        {memberBases.map(b => (
                          <SelectItem key={b.id} value={b.id}>
                            {baseName(b)}{b.isPrimary ? " (primary)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })()}
              </div>
              );
            })}
            {/* Running total for crew — flat entries use flatAmount, hourly = hours × rate */}
            {crew.some(e => e.crewMemberId && (Number(e.hoursWorked) > 0 || (e.payType === "flat" && Number(e.flatAmount) > 0))) && (
              <div className="text-xs text-right text-muted-foreground pr-8">
                Crew total: <span className="text-purple-300 font-medium">
                  ${crew.reduce((s, e) => s + (e.payType === "flat" ? Number(e.flatAmount ?? 0) : Number(e.hoursWorked) * Number(e.payRatePerHour)), 0).toFixed(2)}
                </span>
              </div>
            )}
          </div>}

          {/* Post Production */}
          {!isLightweight && <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Post Production</Label>
              <Button variant="ghost" size="sm" onClick={() => setPostProduction((p) => [...p, emptyPostEntry()])} className="h-7 text-xs gap-1 text-primary hover:text-primary">
                <Plus className="w-3 h-3" /> Add
              </Button>
            </div>
            <div className="hidden sm:grid grid-cols-[2fr_3fr_75px_60px_80px_28px] gap-2 text-[10px] text-muted-foreground px-0.5 mb-1">
              <span>Person</span><span>Role</span><span>Pay Type</span><span>Hours</span><span>Pay ($)</span><span />
            </div>
            {postProduction.map((entry, idx) => (
              <div key={idx} className="flex flex-col gap-2 sm:grid sm:grid-cols-[2fr_3fr_75px_60px_80px_28px] sm:gap-2 sm:items-center bg-secondary/40 sm:bg-transparent rounded-lg p-2 sm:p-0 sm:pb-2 sm:border-b sm:border-border/30 sm:last:border-b-0">
                <div className="flex gap-2 sm:contents min-w-0">
                  <Select
                    value={entry.crewMemberId}
                    onValueChange={(v) => {
                      if (v === "__new_crew__") {
                        setQuickAddCrew({ idx, section: "post" });
                        setNewCrewName("");
                      } else {
                        updatePostEntry(idx, "crewMemberId", v);
                      }
                    }}
                  >
                    <SelectTrigger className="bg-secondary border-border h-8 text-xs flex-1 min-w-0">
                      <SelectValue placeholder="Person" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="__new_crew__" className="text-primary font-medium">+ New crew member…</SelectItem>
                      {data.crewMembers.filter(c => !c.archived).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={entry.role}
                    onValueChange={(v) => updatePostEntry(idx, "role", v)}
                    disabled={!entry.crewMemberId}
                  >
                    <SelectTrigger className="bg-secondary border-border h-8 text-xs flex-1 min-w-0">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {(data.crewMembers.find(c => c.id === entry.crewMemberId)?.roleRates ?? []).map((rr) => (
                        <SelectItem key={rr.role} value={rr.role}>{rr.role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Mobile-only trash. Desktop trash lives in the
                      second sm:contents wrapper so the 5-col grid
                      stays aligned with the headers above. */}
                  <button onClick={() => setPostProduction((p) => p.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive transition-colors shrink-0 sm:hidden">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex gap-2 sm:contents min-w-0">
                  <div className="flex-1 sm:flex-none min-w-0">
                    <Label className="text-[10px] text-muted-foreground sm:hidden">Pay</Label>
                    <select
                      value={entry.payType || "hourly"}
                      onChange={(e) => updatePostEntry(idx, "payType", e.target.value as "hourly" | "flat")}
                      className="w-full h-8 bg-secondary border border-border rounded px-2 text-xs text-foreground"
                    >
                      <option value="hourly">Hourly</option>
                      <option value="flat">Flat</option>
                    </select>
                  </div>
                  <div className="flex-1 sm:flex-none min-w-0">
                    <Label className="text-[10px] text-muted-foreground sm:hidden">Hours</Label>
                    <Input type="text" inputMode="decimal" placeholder="0" value={postHoursText[idx] ?? (entry.hoursWorked || "")} onChange={(e) => { let v = e.target.value.replace(/[^\d.]/g, ""); const dot = v.indexOf("."); if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, ""); setPostHoursText((prev) => ({ ...prev, [idx]: v })); updatePostEntry(idx, "hoursWorked", v === "" ? 0 : parseFloat(v) || 0); }} className="bg-secondary border-border h-8 text-xs" />
                  </div>
                  <div className="flex-1 sm:flex-none min-w-0">
                    <Label className="text-[10px] text-muted-foreground sm:hidden">{entry.payType === "flat" ? "Flat $" : "Pay/hr ($)"}</Label>
                    {entry.payType === "flat" ? (
                      <Input type="text" inputMode="decimal" placeholder="0.00" value={entry.flatAmount || ""} onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); updatePostEntry(idx, "flatAmount", v === "" ? 0 : parseFloat(v) || 0); }} className="bg-secondary border-border h-8 text-xs" />
                    ) : (
                      <Input type="text" inputMode="decimal" placeholder="0.00" value={entry.payRatePerHour || ""} onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); updatePostEntry(idx, "payRatePerHour", v === "" ? 0 : parseFloat(v) || 0); }} className="bg-secondary border-border h-8 text-xs" />
                    )}
                  </div>
                  <button onClick={() => setPostProduction((p) => p.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive transition-colors hidden sm:block shrink-0 self-end mb-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {postProduction.some(e => e.crewMemberId && (Number(e.hoursWorked) > 0 || (e.payType === "flat" && Number(e.flatAmount) > 0))) && (
              <div className="text-xs text-right text-muted-foreground pr-8">
                Post total: <span className="text-purple-300 font-medium">
                  ${postProduction.reduce((s, e) => s + (e.payType === "flat" ? Number(e.flatAmount ?? 0) : Number(e.hoursWorked) * Number(e.payRatePerHour)), 0).toFixed(2)}
                </span>
              </div>
            )}
          </div>}

          {/* Service Bundle (optional) — pick from a category like
              "Real Estate Shoot" with priced sub-services. When set,
              those services become per-line items on the invoice
              (instead of one rolled-up project line). */}
          {!isLightweight && clientId && (
            <ProjectServiceBundlePicker
              clientId={clientId}
              categoryId={serviceCategoryId}
              services={bundleServices}
              onChange={(catId, services) => {
                setServiceCategoryId(catId);
                setBundleServices(services);
              }}
            />
          )}

          {/* Discount + Project Total — what the client gets billed.
              The discount is per-project: % off the computed billable
              subtotal, or a flat $ amount. Saved on the project and
              applied automatically when this project hits an invoice. */}
          {!isLightweight && selectedClient && (() => {
            // Compute live subtotal from current form state so the user
            // sees the math update as they edit hours/rates. Mirrors
            // getProjectSubtotal but using local state instead of a
            // saved Project row.
            const effectiveModel = billingModelOverride ?? selectedClient.billingModel;
            let subtotal: number;
            if (bundleServices.length > 0) {
              // Service-bundle pricing wins — matches getProjectSubtotal and the
              // invoice, so the discount applies to the real bundle total.
              subtotal = bundleServices.reduce((s, x) => s + Number(x.price ?? 0), 0);
            } else if (effectiveModel === "per_project") {
              const overrideRate = (billingModelOverride && billingRateOverride) || 0;
              const typeRate = selectedClient.projectTypeRates?.find(r => r.projectTypeId === projectTypeId);
              subtotal = overrideRate
                || (projectRate ?? 0)
                || Number(typeRate?.rate ?? selectedClient.perProjectRate ?? 0);
            } else {
              const hourly = billingRateOverride ?? selectedClient.billingRatePerHour ?? 0;
              const totalHours = [...crew, ...postProduction].reduce((s, e) => s + Number(e.hoursWorked || 0), 0);
              subtotal = totalHours * Number(hourly);
            }
            const discount = discountAmount > 0
              ? (discountType === "percent"
                  ? subtotal * (discountAmount / 100)
                  : Math.min(subtotal, discountAmount))
              : 0;
            const total = Math.max(0, subtotal - discount);
            return (
              <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Discount (optional)</Label>
                  <div className="flex gap-2 items-center">
                    <div className="flex bg-secondary border border-border rounded-md overflow-hidden text-xs shrink-0">
                      <button
                        type="button"
                        onClick={() => setDiscountType("percent")}
                        className={`px-2.5 py-1.5 transition-colors ${(discountType || "percent") === "percent" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        % off
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscountType("fixed")}
                        className={`px-2.5 py-1.5 transition-colors ${discountType === "fixed" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        $ off
                      </button>
                    </div>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={discountAmount || ""}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d.]/g, "");
                        setDiscountAmount(v === "" ? 0 : parseFloat(v) || 0);
                        if (!discountType) setDiscountType("percent");
                      }}
                      className="bg-secondary border-border h-8 text-xs w-24"
                    />
                    <Input
                      type="text"
                      placeholder="Reason (optional, shown to client)"
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      className="bg-secondary border-border h-8 text-xs flex-1"
                    />
                  </div>
                </div>

                <div className="border-t border-border pt-3 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="tabular-nums">${subtotal.toFixed(2)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-amber-300">
                      <span>Discount{discountType === "percent" ? ` (${discountAmount}%)` : ""}</span>
                      <span className="tabular-nums">−${discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-semibold pt-1 border-t border-border/50">
                    <span>Project total</span>
                    <span className="tabular-nums text-primary">${total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Broker billing + per-house products + live profit. Bill-to lets a
              real-estate shoot bill up to the agent's broker (overridable per
              shoot); products are per-house tool costs (Fotello); profit =
              revenue − staff pay − product cost. */}
          {!isLightweight && selectedClient && (() => {
            const brokers = data.clients.filter(c => c.clientType === "broker");
            const agentBroker = selectedClient.clientType === "agent" && selectedClient.brokerId
              ? data.clients.find(c => c.id === selectedClient.brokerId) || null
              : null;
            const showBillTo = brokers.length > 0 || !!agentBroker;
            const activeProducts = data.products.filter(p => p.active);
            const selectedIds = new Set(products.map(p => p.productId));
            const toggleProduct = (id: string) => {
              const prod = data.products.find(p => p.id === id);
              if (!prod) return;
              setProducts(prev => prev.some(p => p.productId === id)
                ? prev.filter(p => p.productId !== id)
                : [...prev, { productId: prod.id, name: prod.name, cost: prod.unitCost }]);
            };
            // Per-house cost override — defaults to the catalog cost, but you can
            // enter a different cost for this specific shoot. Cost only, never billed.
            const setProductCost = (id: string, cost: number) =>
              setProducts(prev => prev.map(p => p.productId === id ? { ...p, cost } : p));
            // Live profit via the real helpers, fed a draft project from current state.
            const draft = {
              ...(project ?? {}),
              clientId, projectTypeId, status,
              crew: crew.filter(c => c.crewMemberId),
              postProduction: postProduction.filter(c => c.crewMemberId),
              editorBilling: project?.editorBilling ?? null,
              projectRate, billingModel: billingModelOverride,
              billingRate: billingModelOverride ? billingRateOverride : null,
              discountType: discountAmount > 0 ? discountType : null,
              discountAmount: discountAmount > 0 ? discountAmount : 0,
              serviceCategoryId: serviceCategoryId || null, services: bundleServices,
              products,
            } as Project;
            const revenue = getProjectInvoiceAmount(draft, selectedClient);
            // Labor = assigned-crew pay (real-estate flat rates are auto-filled
            // into the crew rows from Services). Matches getProjectProfit.
            const staffCost = getProjectCrewCost(draft);
            const productCost = getProjectProductCost(draft);
            const profit = revenue - staffCost - productCost;
            const defaultLabel = agentBroker ? `${agentBroker.company} (default)` : `${selectedClient.company} (default)`;
            return (
              <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-3">
                {showBillTo && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Bill to</Label>
                    <select
                      value={billToId || ""}
                      onChange={e => setBillToId(e.target.value || null)}
                      className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">{defaultLabel}</option>
                      {agentBroker && <option value={selectedClient.id}>Bill the agent ({selectedClient.company}) instead</option>}
                      {brokers.filter(b => b.id !== agentBroker?.id).map(b => (
                        <option key={b.id} value={b.id}>Bill broker: {b.company}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Products / software (per house)</Label>
                  {activeProducts.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">No products yet — add Fotello etc. in Finance → Products &amp; Software.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {activeProducts.map(p => {
                        const on = selectedIds.has(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => toggleProduct(p.id)}
                            className={`px-2.5 py-1.5 rounded-md border text-xs transition-colors ${on ? "bg-primary/15 border-primary/40 text-primary" : "bg-secondary border-border text-muted-foreground hover:text-foreground"}`}
                          >
                            {p.name} · ${p.unitCost.toFixed(2)}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Per-house cost for each selected product — editable override. */}
                  {products.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {products.map(sp => {
                        const cat = data.products.find(p => p.id === sp.productId);
                        return (
                          <div key={sp.productId} className="flex items-center gap-2">
                            <span className="text-xs text-foreground flex-1 min-w-0 truncate">{sp.name}</span>
                            <span className="text-xs text-muted-foreground">$</span>
                            <Input
                              type="text"
                              inputMode="decimal"
                              placeholder="0.00"
                              value={sp.cost || ""}
                              onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setProductCost(sp.productId, v === "" ? 0 : parseFloat(v) || 0); }}
                              className="bg-secondary border-border h-8 text-xs w-20"
                            />
                            {cat && cat.unitCost !== sp.cost && (
                              <button type="button" onClick={() => setProductCost(sp.productId, cat.unitCost)} className="text-[10px] text-primary hover:underline whitespace-nowrap" title="Reset to the catalog default cost">
                                default ${cat.unitCost.toFixed(2)}
                              </button>
                            )}
                          </div>
                        );
                      })}
                      <p className="text-[10px] text-muted-foreground">Cost only — never billed to the client. Counts against this house's profit.</p>
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-3 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Revenue</span><span className="tabular-nums">${revenue.toFixed(2)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>− Labor (crew)</span><span className="tabular-nums">−${staffCost.toFixed(2)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>− Products</span><span className="tabular-nums">−${productCost.toFixed(2)}</span></div>
                  <div className="flex justify-between text-base font-semibold pt-1 border-t border-border/50">
                    <span>Your profit</span>
                    <span className={`tabular-nums ${profit >= 0 ? "text-green-400" : "text-red-400"}`}>${profit.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Collapsible "more" sections — Edit Types, Notes, Deliverable Link.
              Most edits don't touch these, so they stay tucked away until
              the user expands. Auto-opens if there's already content
              (so you can see what's there at a glance). */}
          {!isLightweight && (
            <Collapsible defaultOpen={editTypes.length > 0}>
              <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group">
                <ChevronRight className="w-3 h-3 transition-transform group-data-[state=open]:rotate-90" />
                <span className="uppercase tracking-wider">Edit Types{editTypes.length > 0 ? ` (${editTypes.length})` : ""}</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-2">
                {!manageEditTypes ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {visibleEditTypes.map((et) => (
                        <button
                          key={et.id}
                          onClick={() => toggleEditType(et.id)}
                          className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                            editTypes.includes(et.id)
                              ? "bg-primary/20 border-primary/50 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                          }`}
                        >
                          {et.name}
                        </button>
                      ))}
                      {!showNewEditType && (
                        <button
                          onClick={() => setShowNewEditType(true)}
                          className="px-2.5 py-1 rounded text-xs border border-dashed border-primary/50 text-primary hover:bg-primary/10 transition-colors flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Add Edit Type
                        </button>
                      )}
                    </div>
                    {showNewEditType && (
                      <div className="flex gap-2 items-center">
                        <Input
                          value={newEditTypeName}
                          onChange={(e) => setNewEditTypeName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSaveNewEditType()}
                          placeholder="Edit type name"
                          className="bg-secondary border-border h-9 flex-1"
                          autoFocus
                        />
                        <Button size="sm" onClick={handleSaveNewEditType} className="bg-primary text-primary-foreground shrink-0 h-9">Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setShowNewEditType(false); setNewEditTypeName(""); }} className="shrink-0 h-9">Cancel</Button>
                      </div>
                    )}
                  </>
                ) : (
                  /* Manage mode — set which client type sees each edit, or delete it. */
                  <div className="space-y-1.5">
                    {data.editTypes.map((et) => (
                      <div key={et.id} className="flex items-center gap-2">
                        <span className="text-xs text-foreground flex-1 min-w-0 truncate">{et.name}</span>
                        <select
                          value={et.appliesTo ?? "any"}
                          onChange={(e) => updateEditType(et.id, { appliesTo: e.target.value as EditType["appliesTo"] })}
                          className="bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground"
                          title="Which client type sees this edit"
                        >
                          {EDIT_SCOPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <button type="button" onClick={() => deleteEditType(et.id)} className="text-muted-foreground hover:text-destructive shrink-0" title="Delete edit type">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground">"Shown for" controls which client type sees each edit — e.g. set "Full Edit" to Weddings so it stays off real-estate shoots.</p>
                  </div>
                )}
                <button type="button" onClick={() => setManageEditTypes(v => !v)} className="text-[11px] text-muted-foreground hover:text-foreground underline">
                  {manageEditTypes ? "Done managing" : "Manage edit types"}
                </button>
              </CollapsibleContent>
            </Collapsible>
          )}

          <Collapsible defaultOpen={!!notes.trim()}>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group">
              <ChevronRight className="w-3 h-3 transition-transform group-data-[state=open]:rotate-90" />
              <span className="uppercase tracking-wider">Notes{notes.trim() ? " ✓" : ""}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes about this project..." className="bg-secondary border-border resize-none" rows={3} />
            </CollapsibleContent>
          </Collapsible>

          {!isLightweight && (
            <Collapsible defaultOpen={!!deliverableUrl.trim()}>
              <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group">
                <ChevronRight className="w-3 h-3 transition-transform group-data-[state=open]:rotate-90" />
                <span className="uppercase tracking-wider">Deliverable Link{deliverableUrl.trim() ? " ✓" : ""}</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <Input value={deliverableUrl} onChange={(e) => setDeliverableUrl(e.target.value)} placeholder="Google Drive link to final deliverables..." className="bg-secondary border-border" />
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Photo gallery — add images right here, or open the full gallery. */}
          {isEdit && project && (
            <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Images className="w-3.5 h-3.5" /> Photo gallery
                {projectGallery && <span className="normal-case font-normal">· {data.deliveryFiles.filter(f => f.deliveryId === projectGallery.id).length} in gallery</span>}
              </div>
              <input ref={photoInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => { handleAddPhotos(e.target.files); e.currentTarget.value = ""; }} />
              <div className="flex gap-2">
                <Button type="button" onClick={() => photoInputRef.current?.click()} disabled={!!uploadingPhotos} className="flex-1 gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                  <Upload className="w-4 h-4" /> {uploadingPhotos ? `Uploading ${uploadingPhotos.done}/${uploadingPhotos.total}…` : "Add photos here"}
                </Button>
                <Button type="button" variant="outline" onClick={openOrCreateGallery} disabled={creatingGallery} className="border-border gap-1" title="Open the full gallery to arrange & deliver">
                  Open <ArrowUpRight className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Photos upload straight into this shoot's private gallery. "Open" takes you there to arrange &amp; deliver.</p>
            </div>
          )}

          {/* Audit trail — who created it and every status/date/time move. */}
          {isEdit && project && <ProjectHistorySection projectId={project.id} />}
        </div>

        <DialogFooter className="shrink-0 bg-card pt-3 pb-3 -mx-6 px-6 border-t border-border flex-row items-center gap-3 sm:gap-3">
          <Button variant="ghost" onClick={handleCloseWithDraft} className="text-muted-foreground hover:text-foreground shrink-0">Cancel</Button>
          <Button onClick={handleSave} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
            {isEdit ? "Save Changes" : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
      <UpgradeDialog open={showUpgrade} onClose={() => setShowUpgrade(false)} />

      {/* Quick-create crew member — nested dialog */}
      <Dialog open={!!quickAddCrew} onOpenChange={(o) => { if (!o) { setQuickAddCrew(null); setNewCrewName(""); } }}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Add Crew Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input
                autoFocus
                value={newCrewName}
                onChange={(e) => setNewCrewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveNewCrew(); }}
                placeholder="Full name"
                className="bg-secondary border-border mt-1.5"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              You can add roles, pay rates, and contact info later from the Staff page.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setQuickAddCrew(null); setNewCrewName(""); }}>Cancel</Button>
            <Button onClick={handleSaveNewCrew} disabled={!newCrewName.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90">
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
