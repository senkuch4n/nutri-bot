import "server-only";

// HU-029b (§B.6.7 punto 5, anexo de la SDD): el gate real de la suscripción de Arzium reemplaza el stub de
// HU-026. Con el cobro apagado (ARZIUM_SUBSCRIPTIONS_ENABLED ≠ "true") devuelve "not_required" y la titular
// en onboarding pasa a operativa (decisión de Joel); "verified" solo después de verificar la preapproval en MP.
// Si la base falla, tira: resolveOnboardingSubscriptionAccess lo trata como "pending".
export { getTenantSubscriptionGate } from "@nutri-bot/db/domain";
