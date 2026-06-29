"use client";

import { useEffect, useRef, useState } from "react";
import cytoscape from "cytoscape";

type GraphNode = {
  id: string;
  type: "company" | "person";
  label: string;
  isSource?: boolean;
  data: Record<string, unknown>;
};

type GraphEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  isCurrent: boolean;
};

type GraphData = { nodes: GraphNode[]; edges: GraphEdge[] };

export function RelationshipGraph({ companyId }: { companyId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  useEffect(() => {
    fetch(`/api/graph?companyId=${companyId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load graph");
        return r.json();
      })
      .then((d: GraphData) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [companyId]);

  useEffect(() => {
    if (!data || !containerRef.current) return;
    if (data.nodes.length <= 1) return;

    const elements: cytoscape.ElementDefinition[] = [];

    for (const node of data.nodes) {
      const displayLabel = node.type === "person" ? cleanPersonName(node.label) : node.label;
      elements.push({
        data: {
          id: node.id,
          label: truncate(displayLabel, 28),
          fullLabel: displayLabel,
          nodeType: node.type,
          isSource: node.isSource ?? false,
          ...node.data,
        },
      });
    }

    for (const edge of data.edges) {
      elements.push({
        data: {
          id: `edge-${edge.id}`,
          source: edge.source,
          target: edge.target,
          label: edge.label,
          isCurrent: edge.isCurrent,
        },
      });
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node[nodeType='company']",
          style: {
            shape: "round-rectangle",
            "background-color": "#3b82f6",
            label: "data(label)",
            color: "#e2e8f0",
            "text-valign": "bottom",
            "text-margin-y": 8,
            "font-size": 11,
            width: 40,
            height: 40,
            "border-width": 2,
            "border-color": "#60a5fa",
            "text-wrap": "wrap",
            "text-max-width": "100px",
          },
        },
        {
          selector: "node[nodeType='company'][?isSource]",
          style: {
            "background-color": "#2563eb",
            width: 52,
            height: 52,
            "border-width": 3,
            "border-color": "#93c5fd",
            "font-size": 12,
            "font-weight": "bold" as const,
          },
        },
        {
          selector: "node[nodeType='person']",
          style: {
            shape: "ellipse",
            "background-color": "#8b5cf6",
            label: "data(label)",
            color: "#e2e8f0",
            "text-valign": "bottom",
            "text-margin-y": 8,
            "font-size": 10,
            width: 32,
            height: 32,
            "border-width": 2,
            "border-color": "#a78bfa",
            "text-wrap": "wrap",
            "text-max-width": "90px",
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": "#475569",
            "target-arrow-color": "#475569",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            label: "data(label)",
            "font-size": 8,
            color: "#94a3b8",
            "text-rotation": "autorotate",
            "text-margin-y": -8,
          },
        },
        {
          selector: "edge[isCurrent=false]",
          style: {
            "line-style": "dashed",
            opacity: 0.4,
          },
        },
        {
          selector: "node:active",
          style: {
            "overlay-opacity": 0.1,
          },
        },
        {
          selector: "node.highlighted",
          style: {
            "border-width": 4,
            "border-color": "#fbbf24",
          },
        },
      ],
      layout: {
        name: "cose",
        animate: true,
        animationDuration: 800,
        nodeRepulsion: () => 8000,
        idealEdgeLength: () => 120,
        gravity: 0.3,
        padding: 40,
      },
      minZoom: 0.3,
      maxZoom: 3,
      wheelSensitivity: 0.3,
    });

    cy.on("tap", "node", (e) => {
      const node = e.target;
      const nodeData = data.nodes.find((n) => n.id === node.id());
      setSelectedNode(nodeData ?? null);

      cy.nodes().removeClass("highlighted");
      node.addClass("highlighted");
      node.connectedEdges().connectedNodes().addClass("highlighted");
    });

    cy.on("tap", (e) => {
      if (e.target === cy) {
        setSelectedNode(null);
        cy.nodes().removeClass("highlighted");
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [data]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--muted)]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-[var(--border)] p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider opacity-50">
          Relationships
        </h2>
        <p className="text-sm opacity-50">Could not load relationship graph.</p>
      </div>
    );
  }

  if (!data || data.nodes.length <= 1) {
    return (
      <div className="rounded-lg border border-[var(--border)] p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider opacity-50">
          Relationships
        </h2>
        <p className="text-sm opacity-50">
          No relationship data available for this company.
        </p>
      </div>
    );
  }

  const companyCount = data.nodes.filter((n) => n.type === "company").length;
  const personCount = data.nodes.filter((n) => n.type === "person").length;

  return (
    <div className="rounded-lg border border-[var(--border)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider opacity-50">
          Relationship graph
        </h2>
        <div className="flex items-center gap-4 text-[10px] uppercase tracking-wider opacity-40">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" />
            {companyCount} {companyCount === 1 ? "company" : "companies"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-violet-500" />
            {personCount} {personCount === 1 ? "person" : "people"}
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="h-[420px] w-full rounded-md bg-[var(--background)]"
        style={{ border: "1px solid var(--border)" }}
      />

      {selectedNode && (
        <div className="mt-3 rounded-md bg-[var(--muted)] p-3 text-sm">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 ${
                selectedNode.type === "company" ? "rounded-sm bg-blue-500" : "rounded-full bg-violet-500"
              }`}
            />
            <span className="font-medium">
              {selectedNode.type === "person" ? cleanPersonName(selectedNode.label) : selectedNode.label}
            </span>
            <span className="text-xs opacity-40">
              {selectedNode.type === "company" ? "Company" : "Person"}
            </span>
          </div>
          {selectedNode.type === "company" && selectedNode.data.krs != null && (
            <div className="mt-1 text-xs opacity-50">
              KRS {String(selectedNode.data.krs)}
              {selectedNode.data.legal_form != null ? ` · ${String(selectedNode.data.legal_form)}` : ""}
            </div>
          )}
          {selectedNode.type === "company" && !selectedNode.isSource && (
            <a
              href={`/company/${selectedNode.id}`}
              className="mt-1 inline-block text-xs text-[var(--primary)] hover:underline"
            >
              View profile →
            </a>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-[10px] opacity-30">
        <span>Click a node to inspect · Drag to rearrange · Scroll to zoom</span>
        <span>Dashed lines = historical roles</span>
      </div>
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function cleanPersonName(raw: string): string {
  if (!raw.includes("'imie'") && !raw.includes("'nazwisko")) return raw;
  const parts: string[] = [];
  for (const match of raw.matchAll(/'(?:imie|imieDrugie|nazwiskoICzlon|nazwiskoIICzlon)':\s*'([^']+)'/g)) {
    if (match[1] && !/^\*+$/.test(match[1])) parts.push(match[1]);
  }
  return parts.length > 0 ? parts.join(" ") : raw.replace(/[{}']/g, "").trim();
}
