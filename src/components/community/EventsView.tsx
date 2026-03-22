import { useState, useEffect } from "react";
import { Calendar, MapPin, Users, Plus, Clock, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";

// ── Types ──
interface CommunityEvent {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  event_date: string;
  location: string;
  event_type: string;
  sector: string | null;
  stage: string | null;
  max_attendees: number | null;
  created_at: string;
  rsvp_count?: number;
  user_rsvp?: string | null;
}

interface EventRsvp {
  event_id: string;
  user_id: string;
  status: string;
}

const eventTypes = ["Meetup", "Dinner", "Demo Day", "Workshop", "Pitch Night", "Fireside Chat", "Hackathon"];
const sectorOptions = ["AI / ML", "FinTech", "HealthTech", "Climate Tech", "SaaS", "Consumer", "Web3 / Crypto", "DevTools", "EdTech", "BioTech", "Cybersecurity", "Logistics"];
const stageOptions = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Growth"];

// ── Create Event Form ──
function CreateEventDialog({ onCreated, defaults }: { onCreated: () => void; defaults: { location: string; sector: string; stage: string } }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", event_date: "", event_time: "18:00",
    location: defaults.location || "Virtual", event_type: "Meetup",
    sector: defaults.sector || "", stage: defaults.stage || "", max_attendees: "",
  });

  const handleSubmit = async () => {
    if (!form.title || !form.event_date) {
      toast.error("Title and date are required");
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Please sign in to create events"); setLoading(false); return; }

      const dateTime = new Date(`${form.event_date}T${form.event_time}`).toISOString();
      const { error } = await (supabase as any).from("community_events").insert({
        creator_id: user.id,
        title: form.title,
        description: form.description || null,
        event_date: dateTime,
        location: form.location,
        event_type: form.event_type,
        sector: form.sector || null,
        stage: form.stage || null,
        max_attendees: form.max_attendees ? parseInt(form.max_attendees) : null,
      });
      if (error) throw error;
      toast.success("Event created!");
      setOpen(false);
      setForm({ title: "", description: "", event_date: "", event_time: "18:00", location: "Virtual", event_type: "Meetup", sector: "", stage: "", max_attendees: "" });
      onCreated();
    } catch (err: any) {
      toast.error(err.message || "Failed to create event");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 text-xs h-9">
          <Plus className="h-3.5 w-3.5" />
          Create Event
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">Create Community Event</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Event Title *</label>
            <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="AI Founders Dinner" className="h-9 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="What's this event about?" className="text-sm min-h-[60px]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Date *</label>
              <Input type="date" value={form.event_date} onChange={e => setForm(p => ({ ...p, event_date: e.target.value }))} className="h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Time</label>
              <Input type="time" value={form.event_time} onChange={e => setForm(p => ({ ...p, event_time: e.target.value }))} className="h-9 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Location</label>
              <Input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="San Francisco or Virtual" className="h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
              <Select value={form.event_type} onValueChange={v => setForm(p => ({ ...p, event_type: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {eventTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Sector</label>
              <Select value={form.sector} onValueChange={v => setForm(p => ({ ...p, sector: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  {sectorOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Stage</label>
              <Select value={form.stage} onValueChange={v => setForm(p => ({ ...p, stage: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  {stageOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Max Attendees</label>
              <Input type="number" value={form.max_attendees} onChange={e => setForm(p => ({ ...p, max_attendees: e.target.value }))} placeholder="∞" className="h-9 text-sm" />
            </div>
          </div>
          <Button onClick={handleSubmit} disabled={loading} className="w-full text-sm">
            {loading ? "Creating…" : "Create Event"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── RSVP Button ──
function RsvpButton({ event, userId, onToggle }: { event: CommunityEvent; userId: string | null; onToggle: () => void }) {
  const [loading, setLoading] = useState(false);
  const isGoing = event.user_rsvp === "going";
  const isFull = event.max_attendees ? (event.rsvp_count ?? 0) >= event.max_attendees : false;

  const toggle = async () => {
    if (!userId) { toast.error("Please sign in to RSVP"); return; }
    setLoading(true);
    try {
      if (isGoing) {
        await (supabase as any).from("event_rsvps").delete().eq("event_id", event.id).eq("user_id", userId);
      } else {
        if (isFull) { toast.error("Event is full"); setLoading(false); return; }
        await (supabase as any).from("event_rsvps").insert({ event_id: event.id, user_id: userId });
      }
      onToggle();
    } catch (err: any) {
      toast.error(err.message || "RSVP failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      size="sm"
      variant={isGoing ? "default" : "outline"}
      className={cn(
        "w-full text-xs h-8 transition-colors",
        isGoing && "bg-primary hover:bg-primary/90 text-primary-foreground"
      )}
      onClick={toggle}
      disabled={loading || (!isGoing && isFull)}
    >
      {isGoing ? (
        <><CheckCircle2 className="h-3 w-3 mr-1" /> Going</>
      ) : isFull ? "Full" : "RSVP"}
    </Button>
  );
}

// ── Event Card ──
function EventCard({ event, userId, onRsvpToggle }: { event: CommunityEvent; userId: string | null; onRsvpToggle: () => void }) {
  const eventDate = new Date(event.event_date);
  const isPast = eventDate < new Date();

  return (
    <Card className={cn("border-border/50 hover:border-primary/30 transition-colors group", isPast && "opacity-60")}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{event.title}</p>
            {event.description && (
              <p className="text-[11px] text-muted-foreground line-clamp-2">{event.description}</p>
            )}
          </div>
          <Badge variant="outline" className="text-[10px] shrink-0">{event.event_type}</Badge>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {format(eventDate, "MMM d, yyyy")}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {format(eventDate, "h:mm a")}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {event.location}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {event.sector && <Badge variant="secondary" className="text-[10px]">{event.sector}</Badge>}
          {event.stage && <Badge variant="outline" className="text-[10px]">{event.stage}</Badge>}
          <Badge variant="outline" className="text-[10px] ml-auto">
            <Users className="h-2.5 w-2.5 mr-1" />
            {event.rsvp_count ?? 0}{event.max_attendees ? `/${event.max_attendees}` : ""}
          </Badge>
        </div>

        {!isPast && <RsvpButton event={event} userId={userId} onToggle={onRsvpToggle} />}
        {isPast && (
          <div className="text-center text-[11px] text-muted-foreground py-1">Event has ended</div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Filter Tabs ──
type EventFilter = "upcoming" | "past" | "my-events" | "my-rsvps";

// ── Main Component ──
export function EventsView() {
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<EventFilter>("upcoming");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id;

      const client = supabase as any;
      let query = client.from("community_events").select("*").order("event_date", { ascending: true });

      if (filter === "upcoming") {
        query = query.gte("event_date", new Date().toISOString());
      } else if (filter === "past") {
        query = query.lt("event_date", new Date().toISOString()).order("event_date", { ascending: false });
      } else if (filter === "my-events" && uid) {
        query = query.eq("creator_id", uid);
      }

      const { data: eventsData, error } = await query;
      if (error) throw error;

      const eventIds = (eventsData || []).map((e: any) => e.id);
      let rsvpCounts: Record<string, number> = {};
      let userRsvps: Record<string, string> = {};

      if (eventIds.length > 0) {
        const { data: rsvps } = await client.from("event_rsvps").select("event_id, user_id, status").in("event_id", eventIds);
        if (rsvps) {
          (rsvps as EventRsvp[]).forEach((r) => {
            rsvpCounts[r.event_id] = (rsvpCounts[r.event_id] || 0) + 1;
            if (r.user_id === uid) userRsvps[r.event_id] = r.status;
          });
        }
      }

      let enriched: CommunityEvent[] = (eventsData || []).map((e: any) => ({
        ...e,
        rsvp_count: rsvpCounts[e.id] || 0,
        user_rsvp: userRsvps[e.id] || null,
      }));

      if (filter === "my-rsvps") {
        enriched = enriched.filter(e => e.user_rsvp);
      }

      setEvents(enriched);
    } catch {
      toast.error("Failed to load events");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [filter]);

  const filterTabs: { id: EventFilter; label: string }[] = [
    { id: "upcoming", label: "Upcoming" },
    { id: "past", label: "Past" },
    { id: "my-events", label: "My Events" },
    { id: "my-rsvps", label: "My RSVPs" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Events</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Community meetups, workshops, and networking events</p>
        </div>
        <CreateEventDialog onCreated={fetchEvents} />
      </div>

      <div className="flex gap-1 border-b border-border/60 pb-0">
        {filterTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={cn(
              "px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px",
              filter === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-[360px]">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-48 rounded-xl border border-border/50 bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Calendar className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No events found</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Create one to get the community together!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {events.map(event => (
              <EventCard key={event.id} event={event} userId={userId} onRsvpToggle={fetchEvents} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
