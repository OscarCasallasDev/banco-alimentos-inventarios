/**
 * Pruebas unitarias — Exportador ExcelSiigo
 * Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  exportE1ToExcel,
  exportE3ToExcel,
  exportN3ToExcel,
  exportN5ToExcel,
  exportSF1ToExcel,
  exportF2ToExcel,
  exportR1ToExcel,
  exportR2ToExcel,
  exportR3ToExcel,
  exportR4ToExcel,
  exportToExcel,
} from "@/lib/siigo/exporter";
import type {
  E1Entry,
  E3Entry,
  N3Entry,
  N5Entry,
  SF1Invoice,
  F2Invoice,
  R1Receipt,
  R2Receipt,
  R3Receipt,
  R4Receipt,
} from "@/lib/siigo/formats";

// Datos de prueba
const e1Data: E1Entry = {
  formato: "E1",
  numero: "ENT-2026-0001",
  fecha: "28/09/2026",
  nit: "900.123.456-7",
  origen: "Donación Empresa Local",
  documento: "FAC-2026-001",
  estado: "CONFIRMADO",
  notas: "Entrada de prueba",
  items: [
    { producto: "GRN-001", bodega: "1.1", cantidad: 100, unidad: "kg", presentacion: "Bolsa 500g" },
  ],
};

const e3Data: E3Entry = {
  formato: "E3",
  numero: "DON-2026-0001",
  fecha: "28/09/2026",
  nit: "800.987.654-3",
  donante: "Fundación XYZ",
  documento: "DON-2026-001",
  estado: "CONFIRMADO",
  notas: "Donación de prueba",
  items: [
    { producto: "LAC-001", bodega: "1.1", cantidad: 200, unidad: "L", presentacion: "Caja 1L" },
  ],
};

const n3Data: N3Entry = {
  formato: "N3",
  numero: "AJU-2026-0001",
  fecha: "28/09/2026",
  bodega: "1.1",
  tipoAjuste: "FALTANTE",
  estado: "CONFIRMADO",
  notas: "Ajuste por faltante",
  items: [
    { producto: "GRN-001", cantidad: 5, unidad: "kg", causa: "Merma por almacenamiento" },
  ],
};

const n5Data: N5Entry = {
  formato: "N5",
  numero: "CON-2026-0001",
  fecha: "28/09/2026",
  concepto: "Ajuste contable de inventario",
  estado: "CONFIRMADO",
  notas: "Contabilización de prueba",
  items: [
    { cuenta: "140505", debito: 100000, credito: 0, nit: "900.123.456-7", centroCosto: "001" },
  ],
};

const sf1Data: SF1Invoice = {
  formato: "SF1",
  numero: "FAC-2026-0001",
  fecha: "28/09/2026",
  nit: "800.987.654-3",
  cliente: "Comunidad Rural El Salado",
  pedido: "PED-2026-0001",
  estado: "GENERADA",
  items: [
    { producto: "GRN-001", cantidad: 50, unidad: "kg", precioUnitario: 2500, descuento: 0, iva: 0 },
  ],
};

const f2Data: F2Invoice = {
  formato: "F2",
  numero: "FAC-2026-0002",
  fecha: "28/09/2026",
  nit: "800.987.654-3",
  cliente: "Comunidad Rural El Salado",
  estado: "GENERADA",
  items: [
    { producto: "LAC-001", cantidad: 100, unidad: "L", precioUnitario: 3500 },
  ],
};

const r1Data: R1Receipt = {
  formato: "R1",
  numero: "REC-2026-0001",
  fecha: "28/09/2026",
  factura: "FAC-2026-0001",
  nit: "800.987.654-3",
  receptor: "Juan Pérez",
  estado: "GENERADO",
  items: [
    { producto: "GRN-001", cantidad: 50, unidad: "kg", bodega: "1.1" },
  ],
};

const r2Data: R2Receipt = {
  formato: "R2",
  numero: "DEV-2026-0001",
  fecha: "28/09/2026",
  factura: "FAC-2026-0001",
  nit: "800.987.654-3",
  motivo: "Producto dañado",
  estado: "GENERADO",
  items: [
    { producto: "GRN-001", cantidad: 5, unidad: "kg", bodega: "1.1", causa: "Empaque dañado" },
  ],
};

const r3Data: R3Receipt = {
  formato: "R3",
  numero: "TRA-2026-0001",
  fecha: "28/09/2026",
  bodegaOrigen: "1.1",
  bodegaDestino: "4.1",
  estado: "GENERADO",
  items: [
    { producto: "GRN-001", cantidad: 100, unidad: "kg" },
  ],
};

const r4Data: R4Receipt = {
  formato: "R4",
  numero: "AJU-2026-0002",
  fecha: "28/09/2026",
  bodega: "1.1",
  tipoAjuste: "SOBRANTE",
  estado: "GENERADO",
  items: [
    { producto: "GRN-001", cantidad: 2, unidad: "kg", causa: "Sobrante en conteo" },
  ],
};

describe("Exportador ExcelSiigo", () => {
  describe("E1 - Entrada de mercancía", () => {
    it("debe generar un archivo Excel válido", () => {
      const wb = exportE1ToExcel(e1Data);
      expect(wb).toBeDefined();
      expect(wb.SheetNames).toContain("Encabezado");
      expect(wb.SheetNames).toContain("Items");
    });

    it("debe contener los datos correctos en el encabezado", () => {
      const wb = exportE1ToExcel(e1Data);
      const ws = wb.Sheets["Encabezado"];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
      expect(data[0]).toEqual(["Formato", "E1"]);
      expect(data[1]).toEqual(["Número", "ENT-2026-0001"]);
    });
  });

  describe("E3 - Entrada por donación", () => {
    it("debe generar un archivo Excel válido", () => {
      const wb = exportE3ToExcel(e3Data);
      expect(wb).toBeDefined();
      expect(wb.SheetNames).toContain("Encabezado");
      expect(wb.SheetNames).toContain("Items");
    });
  });

  describe("N3 - Nota de ajuste", () => {
    it("debe generar un archivo Excel válido", () => {
      const wb = exportN3ToExcel(n3Data);
      expect(wb).toBeDefined();
      expect(wb.SheetNames).toContain("Encabezado");
      expect(wb.SheetNames).toContain("Items");
    });
  });

  describe("N5 - Nota de contabilización", () => {
    it("debe generar un archivo Excel válido", () => {
      const wb = exportN5ToExcel(n5Data);
      expect(wb).toBeDefined();
      expect(wb.SheetNames).toContain("Encabezado");
      expect(wb.SheetNames).toContain("Items");
    });
  });

  describe("SF1 - Factura de venta", () => {
    it("debe generar un archivo Excel válido", () => {
      const wb = exportSF1ToExcel(sf1Data);
      expect(wb).toBeDefined();
      expect(wb.SheetNames).toContain("Encabezado");
      expect(wb.SheetNames).toContain("Items");
    });
  });

  describe("F2 - Factura simplificada", () => {
    it("debe generar un archivo Excel válido", () => {
      const wb = exportF2ToExcel(f2Data);
      expect(wb).toBeDefined();
      expect(wb.SheetNames).toContain("Encabezado");
      expect(wb.SheetNames).toContain("Items");
    });
  });

  describe("R1 - Recibo de entrega", () => {
    it("debe generar un archivo Excel válido", () => {
      const wb = exportR1ToExcel(r1Data);
      expect(wb).toBeDefined();
      expect(wb.SheetNames).toContain("Encabezado");
      expect(wb.SheetNames).toContain("Items");
    });
  });

  describe("R2 - Recibo de devolución", () => {
    it("debe generar un archivo Excel válido", () => {
      const wb = exportR2ToExcel(r2Data);
      expect(wb).toBeDefined();
      expect(wb.SheetNames).toContain("Encabezado");
      expect(wb.SheetNames).toContain("Items");
    });
  });

  describe("R3 - Recibo de traslado", () => {
    it("debe generar un archivo Excel válido", () => {
      const wb = exportR3ToExcel(r3Data);
      expect(wb).toBeDefined();
      expect(wb.SheetNames).toContain("Encabezado");
      expect(wb.SheetNames).toContain("Items");
    });
  });

  describe("R4 - Recibo de ajuste", () => {
    it("debe generar un archivo Excel válido", () => {
      const wb = exportR4ToExcel(r4Data);
      expect(wb).toBeDefined();
      expect(wb.SheetNames).toContain("Encabezado");
      expect(wb.SheetNames).toContain("Items");
    });
  });

  describe("Función general exportToExcel", () => {
    it("debe exportar correctamente según el formato", () => {
      const wb = exportToExcel(e1Data, "E1");
      expect(wb).toBeDefined();
      expect(wb.SheetNames).toContain("Encabezado");
    });

    it("debe lanzar un error para un formato no soportado", () => {
      expect(() => exportToExcel({}, "INVALID")).toThrow("Formato no soportado");
    });
  });
});
