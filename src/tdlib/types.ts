export interface TdObject {
  "@type": string;
  "@extra"?: string;
  [key: string]: unknown;
}

export interface TdChat extends TdObject {
  "@type": "chat";
  id: number;
  title: string;
  unread_count?: number;
  last_message?: TdMessage;
  type?: TdObject;
  positions?: TdObject[];
}

export interface TdMessage extends TdObject {
  "@type": "message";
  id: number;
  chat_id: number;
  date: number;
  can_be_deleted_only_for_self?: boolean;
  is_outgoing?: boolean;
  sender_id?: TdObject;
  content?: TdObject;
}

export interface TdUser extends TdObject {
  "@type": "user";
  id: number;
  first_name?: string;
  last_name?: string;
  usernames?: {
    editable_username?: string;
    active_usernames?: string[];
  };
  phone_number?: string;
}

export interface TdMessages extends TdObject {
  "@type": "messages";
  messages: TdMessage[];
}

export interface TdChats extends TdObject {
  "@type": "chats";
  chat_ids: number[];
}

export interface TdUsers extends TdObject {
  "@type": "users";
  user_ids: number[];
}
