import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, Mail, Phone, Plus, Search, Trash2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";

type LeadStatus = "novo" | "contatado" | "interessado" | "aula-trial" | "convertido";

type Lead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  interest: string;
  notes: string;
  status: LeadStatus;
  createdAt: string;
};

const STORAGE_KEY = "bps.crm.leads";

const columns: { id: LeadStatus; title: string }[] = [
  { id: "novo", title: "Novo" },
  { id: "contatado", title: "Contatado" },
  { id: "interessado", title: "Interessado" },
  { id: "aula-trial", title: "Aula Trial" },
  { id: "convertido", title: "Convertido" },
];

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  source: "",
  interest: "",
  notes: "",
};

const CRM = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    const storedLeads = localStorage.getItem(STORAGE_KEY);
    if (!storedLeads) return;

    try {
      const parsed = JSON.parse(storedLeads);
      if (Array.isArray(parsed)) setLeads(parsed);
    } catch (error) {
      console.error("Erro ao carregar leads do CRM", error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return leads;

    return leads.filter((lead) =>
      [lead.name, lead.email, lead.phone, lead.source, lead.interest, lead.notes]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [leads, searchTerm]);

  const totalConverted = leads.filter((lead) => lead.status === "convertido").length;

  const handleCreateLead = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const newLead: Lead = {
      id: crypto.randomUUID(),
      name: formData.name.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      source: formData.source.trim(),
      interest: formData.interest.trim(),
      notes: formData.notes.trim(),
      status: "novo",
      createdAt: new Date().toISOString(),
    };

    setLeads((current) => [newLead, ...current]);
    setFormData(emptyForm);
    setIsFormOpen(false);
  };

  const updateLeadStatus = (leadId: string, status: LeadStatus) => {
    setLeads((current) => current.map((lead) => (lead.id === leadId ? { ...lead, status } : lead)));
  };

  const moveLeadForward = (lead: Lead) => {
    const currentIndex = columns.findIndex((column) => column.id === lead.status);
    const nextStatus = columns[currentIndex + 1]?.id;
    if (nextStatus) updateLeadStatus(lead.id, nextStatus);
  };

  const removeLead = (leadId: string) => {
    setLeads((current) => current.filter((lead) => lead.id !== leadId));
  };

  return (
    <DashboardLayout>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CRM</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pipeline de leads e oportunidades</p>
        </div>
        <Button onClick={() => setIsFormOpen((current) => !current)} className="gap-2 rounded-lg font-medium">
          <Plus size={18} />
          Novo Lead
        </Button>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Leads totais</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{leads.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Convertidos</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{totalConverted}</p>
        </div>
        <label className="relative block rounded-xl border border-border bg-card p-4">
          <span className="sr-only">Buscar lead</span>
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar lead..."
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
      </div>

      {isFormOpen && (
        <form onSubmit={handleCreateLead} className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Nome</label>
              <input
                required
                value={formData.name}
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Telefone</label>
              <input
                value={formData.phone}
                onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Origem</label>
              <input
                placeholder="Instagram, indicação, site..."
                value={formData.source}
                onChange={(event) => setFormData({ ...formData, source: event.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Interesse</label>
              <input
                placeholder="Conversação, viagem, trabalho..."
                value={formData.interest}
                onChange={(event) => setFormData({ ...formData, interest: event.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Observações</label>
              <input
                value={formData.notes}
                onChange={(event) => setFormData({ ...formData, notes: event.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">Salvar Lead</Button>
          </div>
        </form>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => {
          const columnLeads = filteredLeads.filter((lead) => lead.status === column.id);

          return (
            <section
              key={column.id}
              className="flex min-h-[260px] w-[280px] min-w-[280px] flex-col rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{column.title}</h3>
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-secondary px-2 text-xs font-medium text-secondary-foreground">
                  {columnLeads.length}
                </span>
              </div>

              {columnLeads.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border">
                  <p className="text-sm text-muted-foreground">Nenhum lead</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {columnLeads.map((lead) => (
                    <article key={lead.id} className="rounded-lg border border-border bg-background p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-semibold text-foreground">{lead.name}</h4>
                          {lead.interest && <p className="mt-1 text-xs text-muted-foreground">{lead.interest}</p>}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLead(lead.id)}
                          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label={`Excluir ${lead.name}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                        {lead.email && (
                          <p className="flex items-center gap-2 truncate">
                            <Mail size={14} />
                            {lead.email}
                          </p>
                        )}
                        {lead.phone && (
                          <p className="flex items-center gap-2">
                            <Phone size={14} />
                            {lead.phone}
                          </p>
                        )}
                        {lead.source && <p>Origem: {lead.source}</p>}
                        {lead.notes && <p className="leading-5">{lead.notes}</p>}
                      </div>

                      <div className="mt-4 flex items-center gap-2">
                        <select
                          value={lead.status}
                          onChange={(event) => updateLeadStatus(lead.id, event.target.value as LeadStatus)}
                          className="h-9 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-xs outline-none focus:ring-2 focus:ring-primary"
                        >
                          {columns.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.title}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => moveLeadForward(lead)}
                          disabled={lead.status === "convertido"}
                          className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`Mover ${lead.name} para a próxima etapa`}
                        >
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </DashboardLayout>
  );
};

export default CRM;
