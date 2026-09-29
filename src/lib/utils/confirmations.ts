/**
 * Sistema de confirmaciones — Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 *
 * Proporciona funciones para confirmar acciones destructivas
 * y mostrar mensajes de éxito/error al usuario.
 */

// ============================================================
// TIPOS
// ============================================================

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "warning" | "info";
}

export interface AlertOptions {
  title: string;
  message: string;
  type?: "success" | "error" | "warning" | "info";
}

// ============================================================
// FUNCIONES DE CONFIRMACIÓN
// ============================================================

/**
 * Muestra un diálogo de confirmación y retorna true si el usuario confirma
 */
export function confirmAction(options: ConfirmOptions): boolean {
  const {
    title,
    message,
    confirmText = "Confirmar",
    cancelText = "Cancelar",
    type = "warning",
  } = options;

  // Construir el mensaje con formato
  const fullMessage = `${title}\n\n${message}\n\n¿${confirmText}?`;

  return window.confirm(fullMessage);
}

/**
 * Confirma la eliminación de un elemento
 */
export function confirmDelete(itemName: string): boolean {
  return confirmAction({
    title: "Eliminar",
    message: `¿Estás seguro de eliminar "${itemName}"?\n\nEsta acción no se puede deshacer.`,
    confirmText: "Sí, eliminar",
    cancelText: "Cancelar",
    type: "danger",
  });
}

/**
 * Confirma la cancelación de un documento
 */
export function confirmCancel(documentType: string, documentNumber: string): boolean {
  return confirmAction({
    title: "Cancelar documento",
    message: `¿Estás seguro de cancelar ${documentType} "${documentNumber}"?`,
    confirmText: "Sí, cancelar",
    cancelText: "No",
    type: "warning",
  });
}

/**
 * Confirma la confirmación de una entrada
 */
export function confirmConfirmEntry(entryNumber: string): boolean {
  return confirmAction({
    title: "Confirmar entrada",
    message: `¿Estás seguro de confirmar la entrada "${entryNumber}"?\n\nUna vez confirmada, no se puede modificar.`,
    confirmText: "Sí, confirmar",
    cancelText: "Cancelar",
    type: "info",
  });
}

/**
 * Confirma el despacho de productos
 */
export function confirmDispatch(dispatchNumber: string): boolean {
  return confirmAction({
    title: "Confirmar despacho",
    message: `¿Estás seguro de confirmar el despacho "${dispatchNumber}"?\n\nSe descontará el inventario automáticamente.`,
    confirmText: "Sí, despachar",
    cancelText: "Cancelar",
    type: "warning",
  });
}

/**
 * Confirma la realización de una auditoría
 */
export function confirmAudit(auditDate: string): boolean {
  return confirmAction({
    title: "Completar auditoría",
    message: `¿Estás seguro de completar la auditoría del ${auditDate}?\n\nSe registrarán las diferencias encontradas.`,
    confirmText: "Sí, completar",
    cancelText: "Cancelar",
    type: "info",
  });
}

// ============================================================
// FUNCIONES DE ALERTA
// ============================================================

/**
 * Muestra un mensaje de éxito
 */
export function showSuccess(message: string): void {
  window.alert(`✓ ${message}`);
}

/**
 * Muestra un mensaje de error
 */
export function showError(message: string): void {
  window.alert(`✗ ${message}`);
}

/**
 * Muestra un mensaje de advertencia
 */
export function showWarning(message: string): void {
  window.alert(`⚠ ${message}`);
}

/**
 * Muestra un mensaje informativo
 */
export function showInfo(message: string): void {
  window.alert(`ℹ ${message}`);
}

// ============================================================
// HOOK DE CONFIRMACIÓN PARA REACT
// ============================================================

import { useState, useCallback } from "react";

export function useConfirm() {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [resolvePromise, setResolvePromise] = useState<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    setIsOpen(true);
    return new Promise((resolve) => {
      setResolvePromise(() => resolve);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setIsOpen(false);
    resolvePromise?.(true);
    setOptions(null);
  }, [resolvePromise]);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    resolvePromise?.(false);
    setOptions(null);
  }, [resolvePromise]);

  return {
    confirm,
    isOpen,
    options,
    handleConfirm,
    handleCancel,
  };
}
