import "server-only";
import { COUNTRIES, type CountryCode, type FcfaCurrency } from "./countries";

/**
 * Client minimal de l'API REST CinetPay (v1, authentification Bearer).
 * Référence : SDK officiel cinetpay/cinetpay-php-sdk.
 *  - POST /v1/oauth/login        → jeton d'accès
 *  - POST /v1/payment            → initialisation, renvoie payment_url + notify_token
 *  - GET  /v1/payment/{id}       → statut canonique (id = merchant_transaction_id ou transaction_id)
 */

export type CinetPayEnvironment = "sandbox" | "production";

const BASE_URLS: Record<CinetPayEnvironment, string> = {
  sandbox: "https://api.cinetpay.net",
  production: "https://api.cinetpay.co",
};

const AUTH_ERROR_STATUSES = new Set(["INVALID_CREDENTIALS", "INVALID_TOKEN", "EXPIRED_TOKEN"]);

export interface CinetPayAccount {
  country: CountryCode;
  apiKey: string;
  apiPassword: string;
  environment: CinetPayEnvironment;
}

export interface CreatePaymentInput {
  currency: FcfaCurrency;
  merchantTransactionId: string;
  amount: number;
  successUrl: string;
  failedUrl: string;
  notifyUrl: string;
  designation: string;
  clientFirstName: string;
  clientLastName: string;
  clientEmail: string;
  clientPhoneNumber?: string;
}

export interface PaymentInitialization {
  status: string;
  merchantTransactionId: string;
  transactionId: string;
  notifyToken: string | null;
  paymentToken: string | null;
  paymentUrl: string | null;
}

export interface PaymentStatus {
  status: string;
  merchantTransactionId: string;
  transactionId: string;
}

export class CinetPayError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null,
    readonly apiStatus: string | null,
  ) {
    super(message);
    this.name = "CinetPayError";
  }
}

type Fetch = typeof fetch;
type Json = Record<string, unknown>;

interface CachedToken {
  token: string;
  expiresAt: number;
}

const str = (o: Json, k: string): string => (typeof o[k] === "string" ? (o[k] as string) : "");
const nullableStr = (o: Json, k: string): string | null => (typeof o[k] === "string" ? (o[k] as string) : null);
const asObject = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});

export class CinetPayClient {
  private cached: CachedToken | null = null;

  constructor(
    private readonly account: CinetPayAccount,
    private readonly fetchImpl: Fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async createPayment(input: CreatePaymentInput): Promise<PaymentInitialization> {
    const body: Json = {
      currency: input.currency,
      merchant_transaction_id: input.merchantTransactionId,
      amount: input.amount,
      success_url: input.successUrl,
      failed_url: input.failedUrl,
      notify_url: input.notifyUrl,
      lang: "fr",
      designation: input.designation,
      client_first_name: input.clientFirstName,
      client_last_name: input.clientLastName,
      client_email: input.clientEmail,
      direct_pay: false,
    };
    if (input.clientPhoneNumber) body.client_phone_number = input.clientPhoneNumber;

    const data = await this.authed("POST", "/v1/payment", body);
    return {
      status: str(data, "status"),
      merchantTransactionId: str(data, "merchant_transaction_id"),
      transactionId: str(data, "transaction_id"),
      notifyToken: nullableStr(data, "notify_token"),
      paymentToken: nullableStr(data, "payment_token"),
      paymentUrl: nullableStr(data, "payment_url"),
    };
  }

  async findPayment(id: string): Promise<PaymentStatus> {
    const data = await this.authed("GET", `/v1/payment/${encodeURIComponent(id)}`);
    return {
      status: str(data, "status"),
      merchantTransactionId: str(data, "merchant_transaction_id"),
      transactionId: str(data, "transaction_id"),
    };
  }

  private async authed(method: "GET" | "POST", path: string, body?: Json): Promise<Json> {
    try {
      return await this.request(method, path, body, await this.token());
    } catch (error) {
      // Jeton expiré ou révoqué : on le renouvelle une seule fois.
      if (error instanceof CinetPayError && (error.httpStatus === 401 || AUTH_ERROR_STATUSES.has(error.apiStatus ?? ""))) {
        return this.request(method, path, body, await this.token(true));
      }
      throw error;
    }
  }

  private async token(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.cached && this.now() < this.cached.expiresAt) return this.cached.token;
    this.cached = null;

    const data = await this.request("POST", "/v1/oauth/login", {
      api_key: this.account.apiKey,
      api_password: this.account.apiPassword,
    });
    const nested = asObject(data.data);
    const token = str(data, "access_token") || str(nested, "token");
    if (!token) throw new CinetPayError("Réponse d'authentification CinetPay sans jeton.", 200, null);

    const rawExpiresIn = typeof data.expires_in === "number" ? data.expires_in : nested.expires_in;
    const expiresIn = typeof rawExpiresIn === "number" && rawExpiresIn > 0 ? rawExpiresIn : 300;
    // Marge de 30 s pour ne pas utiliser un jeton sur le point d'expirer.
    this.cached = { token, expiresAt: this.now() + Math.max(0, expiresIn - 30) * 1000 };
    return token;
  }

  private async request(method: "GET" | "POST", path: string, body?: Json, bearer?: string): Promise<Json> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    if (bearer) headers.Authorization = `Bearer ${bearer}`;

    let response: Response;
    try {
      response = await this.fetchImpl(`${BASE_URLS[this.account.environment]}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new CinetPayError(`CinetPay injoignable : ${(error as Error).message}`, null, null);
    }

    const text = await response.text();
    let data: Json = {};
    if (text) {
      try {
        data = asObject(JSON.parse(text));
      } catch {
        throw new CinetPayError("Réponse CinetPay invalide (JSON attendu).", response.status, null);
      }
    }

    const apiStatus = nullableStr(data, "status");
    if (!response.ok || AUTH_ERROR_STATUSES.has(apiStatus ?? "")) {
      const message = str(data, "description") || str(data, "message") || apiStatus || `HTTP ${response.status}`;
      throw new CinetPayError(`CinetPay : ${message}`, response.status, apiStatus);
    }
    return data;
  }
}

/** Statut de commande déduit du statut canonique CinetPay. */
export function orderStatusFromCinetPay(status: string): "paid" | "failed" | "pending" {
  if (status === "SUCCESS") return "paid";
  if (status === "FAILED" || status === "EXPIRED" || status === "INSUFFICIENT_BALANCE") return "failed";
  return "pending";
}

// ---------- Configuration par variables d'environnement ----------

function environment(): CinetPayEnvironment {
  return process.env.CINETPAY_ENV === "production" ? "production" : "sandbox";
}

/** Compte du pays, si CINETPAY_<PAYS>_API_KEY et CINETPAY_<PAYS>_API_PASSWORD sont définis. */
export function accountFor(country: CountryCode): CinetPayAccount | null {
  const apiKey = process.env[`CINETPAY_${country}_API_KEY`];
  const apiPassword = process.env[`CINETPAY_${country}_API_PASSWORD`];
  if (!apiKey || !apiPassword) return null;
  return { country, apiKey, apiPassword, environment: environment() };
}

// Un client (et donc un jeton en cache) par pays, réutilisé entre les requêtes d'une même instance.
const clients = new Map<CountryCode, CinetPayClient>();

export function clientFor(country: CountryCode): CinetPayClient | null {
  const existing = clients.get(country);
  if (existing) return existing;
  const account = accountFor(country);
  if (!account) return null;
  const client = new CinetPayClient(account);
  clients.set(country, client);
  return client;
}

/** Pays pour lesquels un compte marchand CinetPay est configuré. */
export function enabledCountries(): CountryCode[] {
  return COUNTRIES.filter((c) => accountFor(c.code) !== null).map((c) => c.code);
}
