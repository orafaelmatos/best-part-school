import React from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";

const columns = [
  { id: "novo", title: "Novo" },
  { id: "contatado", title: "Contatado" },
  { id: "interessado", title: "Interessado" },
  { id: "aula-trial", title: "Aula Trial" },
  { id: "convertido", title: "Convertido" },
];

const CRM = () => {
  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CRM</h1>
          <p className="text-sm text-muted-foreground mt-1">Pipeline de leads</p>
        </div>
        <Button className="bg-black hover:bg-zinc-800 text-white font-medium rounded-lg">
          + Novo Lead
        </Button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div key={col.id} className="min-w-[250px] w-[250px] bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col min-h-[150px]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-sm">{col.title}</h3>
              <span className="w-5 h-5 flex items-center justify-center bg-secondary text-secondary-foreground rounded-full text-xs font-medium">
                0
              </span>
            </div>
            
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Nenhum lead</p>
            </div>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
};

export default CRM;
