/**
 * Signal API Context
 * Wrapper for signal-cli-rest-api
 * Already Loria-independent - copied from cantrip-integrations
 */

export type SignalOptions = {
  /** Base URL of signal-cli-rest-api (default: http://localhost:8080) */
  apiUrl?: string;
  /** Phone number registered with Signal (e.g., +14155551234) */
  phoneNumber?: string;
};

export type SignalMessage = {
  envelope: {
    source: string;
    sourceNumber: string;
    sourceName?: string;
    timestamp: number;
    dataMessage?: {
      timestamp: number;
      message: string;
      groupInfo?: {
        groupId: string;
        type: string;
      };
      mentions?: Array<{
        start: number;
        length: number;
        uuid: string;
        number?: string;
      }>;
      attachments?: Array<{
        contentType: string;
        filename: string;
        id: string;
        size: number;
      }>;
      reaction?: {
        emoji: string;
        targetTimestamp: number;
      };
    };
    typingMessage?: {
      action: string;
      timestamp: number;
    };
    receiptMessage?: {
      type: string;
      timestamps: number[];
    };
  };
  account: string;
};

export type SignalGroup = {
  id: string;
  name: string;
  internal_id: string;
  members: string[];
  blocked: boolean;
  pending_invites: string[];
  pending_requests: string[];
  invite_link: string;
  admins: string[];
};

/**
 * Context for interacting with signal-cli-rest-api.
 * Requires a running signal-cli-rest-api instance (Docker recommended).
 *
 * @see https://github.com/bbernhard/signal-cli-rest-api
 */
export class SignalContext {
  private apiUrl: string;
  private phoneNumber: string;
  private groupCache: Map<string, string> = new Map(); // internal_id -> id
  private groupCacheTime: number = 0;
  private readonly GROUP_CACHE_TTL = 60000; // 1 minute

  private constructor(options: Required<Pick<SignalOptions, 'phoneNumber'>> & SignalOptions) {
    this.apiUrl = (options.apiUrl || 'http://localhost:8080').replace(/\/$/, '');
    this.phoneNumber = options.phoneNumber;
  }

  /**
   * Create a SignalContext with immediate validation.
   */
  static async create(options?: SignalOptions): Promise<SignalContext> {
    const apiUrl = options?.apiUrl || process.env.SIGNAL_API_URL || 'http://localhost:8080';
    const phoneNumber = options?.phoneNumber || process.env.SIGNAL_PHONE_NUMBER;

    if (!phoneNumber) {
      throw new Error(
        'Signal phone number required. Set SIGNAL_PHONE_NUMBER environment variable (e.g., +14155551234)'
      );
    }

    const context = new SignalContext({ apiUrl, phoneNumber });

    // Verify connection by checking API health
    try {
      const response = await context.request('/v1/about', { method: 'GET' });
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
    } catch (error) {
      throw new Error(
        `Failed to connect to signal-cli-rest-api at ${apiUrl}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return context;
  }

  /**
   * Get the registered phone number.
   */
  getPhoneNumber(): string {
    return this.phoneNumber;
  }

  private cachedProfile: { uuid: string; name: string } | null = null;

  /**
   * Get the bot's profile (UUID and name).
   */
  async getProfile(): Promise<{ uuid: string; name: string }> {
    if (this.cachedProfile) {
      return this.cachedProfile;
    }

    // First check if account exists
    const accountsResponse = await this.get('/v1/accounts');
    const accounts = Array.isArray(accountsResponse) ? accountsResponse : [];

    if (!accounts.includes(this.phoneNumber)) {
      throw new Error(`Bot account ${this.phoneNumber} not found in signal-cli`);
    }

    // Try /v1/about endpoint
    try {
      const about = await this.get(`/v1/about/${encodeURIComponent(this.phoneNumber)}`);

      if (about && typeof about === 'object') {
        const uuid = about.uuid || about.aci || about.address;
        const name = about.name || about.profileName || '';
        if (uuid && uuid !== this.phoneNumber) {
          this.cachedProfile = { uuid, name };
          return this.cachedProfile;
        }
      }
    } catch (error) {
      // Try next method
    }

    // Try /v1/identities endpoint
    try {
      const identities = await this.get(`/v1/identities/${encodeURIComponent(this.phoneNumber)}`);

      if (Array.isArray(identities) && identities.length > 0) {
        for (const identity of identities) {
          const uuid = identity.uuid || identity.aci || identity.address;
          if (uuid && uuid !== this.phoneNumber) {
            this.cachedProfile = { uuid, name: identity.name || '' };
            return this.cachedProfile;
          }
        }
      }
    } catch (error) {
      // Try next method
    }

    // Fallback: use phone number
    this.cachedProfile = { uuid: this.phoneNumber, name: '' };
    return this.cachedProfile;
  }

  /**
   * Make a raw HTTP request to the Signal API.
   */
  async request(path: string, options: RequestInit = {}): Promise<Response> {
    const url = path.startsWith('http') ? path : `${this.apiUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    return fetch(url, { ...options, headers });
  }

  /**
   * Make a GET request and return parsed JSON.
   */
  async get(path: string): Promise<any> {
    const response = await this.request(path, { method: 'GET' });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Signal API error (${response.status}): ${text}`);
    }
    return response.json();
  }

  /**
   * Make a POST request with JSON body.
   */
  async post(path: string, body: any): Promise<any> {
    const response = await this.request(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Signal API error (${response.status}): ${text}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }

  /**
   * Send a message to one or more recipients.
   */
  async sendMessage(
    recipients: string[],
    message: string,
    options?: {
      base64Attachments?: string[];
      mentions?: Array<{ start: number; length: number; uuid: string }>;
    }
  ): Promise<any> {
    const body: any = {
      message,
      number: this.phoneNumber,
      recipients,
    };

    if (options?.base64Attachments?.length) {
      body.base64_attachments = options.base64Attachments;
    }

    if (options?.mentions?.length) {
      body.mentions = options.mentions;
    }

    return this.post('/v2/send', body);
  }

  /**
   * Send a message to a group.
   */
  async sendGroupMessage(
    groupId: string,
    message: string,
    options?: {
      base64Attachments?: string[];
    }
  ): Promise<any> {
    let groupRecipient: string;

    if (groupId.startsWith('group.')) {
      groupRecipient = groupId;
    } else {
      // Lookup internal_id -> id mapping
      if (
        this.groupCache.has(groupId) &&
        Date.now() - this.groupCacheTime < this.GROUP_CACHE_TTL
      ) {
        groupRecipient = this.groupCache.get(groupId)!;
      } else {
        const groups = await this.listGroups();
        this.groupCache.clear();
        this.groupCacheTime = Date.now();
        for (const g of groups) {
          this.groupCache.set(g.internal_id, g.id);
        }

        if (this.groupCache.has(groupId)) {
          groupRecipient = this.groupCache.get(groupId)!;
        } else {
          groupRecipient = `group.${groupId}`;
        }
      }
    }

    const body: any = {
      message,
      number: this.phoneNumber,
      recipients: [groupRecipient],
    };

    if (options?.base64Attachments?.length) {
      body.base64_attachments = options.base64Attachments;
    }

    return this.post('/v2/send', body);
  }

  /**
   * Receive pending messages.
   */
  async receiveMessages(): Promise<SignalMessage[]> {
    return this.get(`/v1/receive/${encodeURIComponent(this.phoneNumber)}`);
  }

  /**
   * List all groups.
   */
  async listGroups(): Promise<SignalGroup[]> {
    return this.get(`/v1/groups/${encodeURIComponent(this.phoneNumber)}`);
  }

  /**
   * Update the bot's profile (name and/or avatar).
   */
  async updateProfile(options: { name?: string; avatarBase64?: string }): Promise<any> {
    const body: any = {};

    if (options.name) {
      body.name = options.name;
    }

    if (options.avatarBase64) {
      body.base64_avatar = options.avatarBase64;
    }

    console.log(`[Signal] Updating profile: ${JSON.stringify({ name: options.name, hasAvatar: !!options.avatarBase64 })}`);

    const response = await this.request(`/v1/profiles/${encodeURIComponent(this.phoneNumber)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });

    // 204 No Content is success for this endpoint
    if (!response.ok && response.status !== 204) {
      const text = await response.text();
      throw new Error(`Signal API error (${response.status}): ${text}`);
    }

    // Clear cached profile so next getProfile() fetches fresh data
    this.cachedProfile = null;

    console.log(`[Signal] Profile updated successfully`);
    return { success: true, name: options.name, avatarUpdated: !!options.avatarBase64 };
  }

  /**
   * Send a reaction to a message.
   */
  async sendReaction(recipient: string, emoji: string, targetTimestamp: number): Promise<any> {
    const response = await this.request(`/v1/reactions/${encodeURIComponent(this.phoneNumber)}`, {
      method: 'POST',
      body: JSON.stringify({
        reaction: emoji,
        recipient: recipient,
        target_author: recipient,
        timestamp: targetTimestamp,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Signal API error (${response.status}): ${text}`);
    }

    return { success: true };
  }
}
