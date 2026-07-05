--
-- PostgreSQL database dump
--

\restrict v62Lv3YrVWuwkf7g24sTbutecEr2LKc20glWT98cRRRKgkFtSKDOszAnZuUmLG3

-- Dumped from database version 16.14 (Debian 16.14-1.pgdg13+1)
-- Dumped by pg_dump version 16.14 (Debian 16.14-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

DROP INDEX IF EXISTS public.uq_users_invite_code;
DROP INDEX IF EXISTS public.idx_users_invite_code;
DROP INDEX IF EXISTS public.idx_user_subscriptions_user_status;
DROP INDEX IF EXISTS public.idx_user_subscriptions_plan_id;
DROP INDEX IF EXISTS public.idx_user_invites_ip_created;
DROP INDEX IF EXISTS public.idx_user_invites_inviter_id;
DROP INDEX IF EXISTS public.idx_user_invites_invitee_id;
DROP INDEX IF EXISTS public.idx_user_email_tokens_user_id;
DROP INDEX IF EXISTS public.idx_user_email_tokens_purpose;
DROP INDEX IF EXISTS public.idx_user_email_tokens_expires_at;
DROP INDEX IF EXISTS public.idx_user_checkins_user_id_checkin_date;
DROP INDEX IF EXISTS public.idx_user_checkins_date;
DROP INDEX IF EXISTS public.idx_user_api_keys_user_id;
DROP INDEX IF EXISTS public.idx_user_api_keys_prefix_status;
DROP INDEX IF EXISTS public.idx_subscription_plans_status_sort;
DROP INDEX IF EXISTS public.idx_redeem_codes_user_id;
DROP INDEX IF EXISTS public.idx_redeem_codes_status;
DROP INDEX IF EXISTS public.idx_recharge_orders_user_id_created_at;
DROP INDEX IF EXISTS public.idx_recharge_orders_user_id;
DROP INDEX IF EXISTS public.idx_recharge_orders_status_created_at;
DROP INDEX IF EXISTS public.idx_recharge_orders_status;
DROP INDEX IF EXISTS public.idx_recharge_orders_out_trade_no;
DROP INDEX IF EXISTS public.idx_oauth_tokens_user_id;
DROP INDEX IF EXISTS public.idx_oauth_tokens_expires_at;
DROP INDEX IF EXISTS public.idx_oauth_codes_expires_at;
DROP INDEX IF EXISTS public.idx_oauth_codes_client_user;
DROP INDEX IF EXISTS public.idx_generation_tasks_user_id_created_at;
DROP INDEX IF EXISTS public.idx_generation_tasks_user_id;
DROP INDEX IF EXISTS public.idx_generation_tasks_user_favorite;
DROP INDEX IF EXISTS public.idx_generation_tasks_user_created_id;
DROP INDEX IF EXISTS public.idx_generation_tasks_status_created_at;
DROP INDEX IF EXISTS public.idx_generation_tasks_public_status_display_enabled_created_at;
DROP INDEX IF EXISTS public.idx_generation_tasks_public_status;
DROP INDEX IF EXISTS public.idx_generation_tasks_created_at_user_id;
DROP INDEX IF EXISTS public.idx_generation_tasks_created_at;
DROP INDEX IF EXISTS public.idx_generation_tasks_capability;
DROP INDEX IF EXISTS public.idx_credit_logs_user_id_created_at;
DROP INDEX IF EXISTS public.idx_credit_logs_user_id;
DROP INDEX IF EXISTS public.idx_credit_logs_user_created_id;
DROP INDEX IF EXISTS public.idx_credit_logs_type_created_at;
DROP INDEX IF EXISTS public.idx_credit_logs_created_at;
DROP INDEX IF EXISTS public.idx_announcements_status_sort;
DROP INDEX IF EXISTS public.idx_announcement_users_user_id;
DROP INDEX IF EXISTS public.idx_announcement_receipts_user_id;
DROP INDEX IF EXISTS public.idx_ai_models_status_capability;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE IF EXISTS ONLY public.user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_user_id_key;
ALTER TABLE IF EXISTS ONLY public.user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_pkey;
ALTER TABLE IF EXISTS ONLY public.user_invites DROP CONSTRAINT IF EXISTS user_invites_pkey;
ALTER TABLE IF EXISTS ONLY public.user_invites DROP CONSTRAINT IF EXISTS user_invites_invitee_id_key;
ALTER TABLE IF EXISTS ONLY public.user_email_tokens DROP CONSTRAINT IF EXISTS user_email_tokens_pkey;
ALTER TABLE IF EXISTS ONLY public.user_credit_ratio_backup DROP CONSTRAINT IF EXISTS user_credit_ratio_backup_pkey;
ALTER TABLE IF EXISTS ONLY public.user_checkins DROP CONSTRAINT IF EXISTS user_checkins_pkey;
ALTER TABLE IF EXISTS ONLY public.user_api_keys DROP CONSTRAINT IF EXISTS user_api_keys_pkey;
ALTER TABLE IF EXISTS ONLY public.user_api_keys DROP CONSTRAINT IF EXISTS user_api_keys_key_hash_key;
ALTER TABLE IF EXISTS ONLY public.user_checkins DROP CONSTRAINT IF EXISTS uq_user_checkins_user_date;
ALTER TABLE IF EXISTS ONLY public.ai_models DROP CONSTRAINT IF EXISTS uq_ai_models_provider_model_capability;
ALTER TABLE IF EXISTS ONLY public.system_settings DROP CONSTRAINT IF EXISTS system_settings_pkey;
ALTER TABLE IF EXISTS ONLY public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_pkey;
ALTER TABLE IF EXISTS ONLY public.redeem_codes DROP CONSTRAINT IF EXISTS redeem_codes_pkey;
ALTER TABLE IF EXISTS ONLY public.redeem_codes DROP CONSTRAINT IF EXISTS redeem_codes_code_key;
ALTER TABLE IF EXISTS ONLY public.recharge_orders DROP CONSTRAINT IF EXISTS recharge_orders_pkey;
ALTER TABLE IF EXISTS ONLY public.recharge_orders DROP CONSTRAINT IF EXISTS recharge_orders_out_trade_no_key;
ALTER TABLE IF EXISTS ONLY public.oauth_authorization_codes DROP CONSTRAINT IF EXISTS oauth_authorization_codes_pkey;
ALTER TABLE IF EXISTS ONLY public.oauth_access_tokens DROP CONSTRAINT IF EXISTS oauth_access_tokens_pkey;
ALTER TABLE IF EXISTS ONLY public.generation_tasks DROP CONSTRAINT IF EXISTS generation_tasks_pkey;
ALTER TABLE IF EXISTS ONLY public.credit_logs DROP CONSTRAINT IF EXISTS credit_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.api_providers DROP CONSTRAINT IF EXISTS api_providers_pkey;
ALTER TABLE IF EXISTS ONLY public.announcements DROP CONSTRAINT IF EXISTS announcements_pkey;
ALTER TABLE IF EXISTS ONLY public.announcement_users DROP CONSTRAINT IF EXISTS announcement_users_pkey;
ALTER TABLE IF EXISTS ONLY public.announcement_receipts DROP CONSTRAINT IF EXISTS announcement_receipts_pkey;
ALTER TABLE IF EXISTS ONLY public.ai_models DROP CONSTRAINT IF EXISTS ai_models_pkey;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.user_subscriptions;
DROP TABLE IF EXISTS public.user_invites;
DROP TABLE IF EXISTS public.user_email_tokens;
DROP TABLE IF EXISTS public.user_credit_ratio_backup;
DROP TABLE IF EXISTS public.user_checkins;
DROP TABLE IF EXISTS public.user_api_keys;
DROP TABLE IF EXISTS public.system_settings;
DROP TABLE IF EXISTS public.subscription_plans;
DROP TABLE IF EXISTS public.redeem_codes;
DROP TABLE IF EXISTS public.recharge_orders;
DROP TABLE IF EXISTS public.oauth_authorization_codes;
DROP TABLE IF EXISTS public.oauth_access_tokens;
DROP TABLE IF EXISTS public.generation_tasks;
DROP TABLE IF EXISTS public.credit_logs;
DROP TABLE IF EXISTS public.api_providers;
DROP TABLE IF EXISTS public.announcements;
DROP TABLE IF EXISTS public.announcement_users;
DROP TABLE IF EXISTS public.announcement_receipts;
DROP TABLE IF EXISTS public.ai_models;
SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_models (
    id character varying(36) NOT NULL,
    provider_id character varying(36) NOT NULL,
    model_name character varying(120) NOT NULL,
    display_name character varying(120) NOT NULL,
    capability character varying(32) DEFAULT 'image'::character varying NOT NULL,
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    price_1k numeric(10,4) DEFAULT 0.0000 NOT NULL,
    price_2k numeric(10,4) DEFAULT 0.0000 NOT NULL,
    price_4k numeric(10,4) DEFAULT 0.0000 NOT NULL,
    append_size_to_prompt boolean DEFAULT false NOT NULL,
    enabled_size_tiers jsonb,
    sort_order integer DEFAULT 100 NOT NULL,
    cost_1k numeric(10,4) DEFAULT 0.0000 NOT NULL,
    cost_2k numeric(10,4) DEFAULT 0.0000 NOT NULL,
    cost_4k numeric(10,4) DEFAULT 0.0000 NOT NULL,
    markup_percent numeric(8,2) DEFAULT 0.00 NOT NULL,
    price_change_percent numeric(8,2) DEFAULT 0.00 NOT NULL
);


--
-- Name: announcement_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcement_receipts (
    announcement_id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    signed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: announcement_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcement_users (
    announcement_id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    id character varying(36) NOT NULL,
    title character varying(120) NOT NULL,
    content text NOT NULL,
    display_mode character varying(20) DEFAULT 'popup'::character varying NOT NULL,
    target_type character varying(20) DEFAULT 'all'::character varying NOT NULL,
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: api_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_providers (
    id character varying(36) NOT NULL,
    name character varying(80) NOT NULL,
    type character varying(32) NOT NULL,
    capability character varying(32) DEFAULT 'chat_image'::character varying NOT NULL,
    base_url character varying(255) NOT NULL,
    api_key character varying(255) NOT NULL,
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: credit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_logs (
    id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    type character varying(16) NOT NULL,
    amount numeric(12,4) NOT NULL,
    balance_after numeric(12,4) NOT NULL,
    remark character varying(200),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: generation_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.generation_tasks (
    id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    model_id character varying(36) NOT NULL,
    provider_id character varying(36) NOT NULL,
    capability character varying(32) NOT NULL,
    prompt text NOT NULL,
    reference_image_url text,
    size_tier character varying(8) DEFAULT '1k'::character varying NOT NULL,
    size character varying(30),
    output_format character varying(20) DEFAULT 'jpeg'::character varying NOT NULL,
    transparent_background boolean DEFAULT false NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    user_ip character varying(64) NOT NULL,
    cost_credits numeric(12,4) DEFAULT 0.0000 NOT NULL,
    model_cost_credits numeric(12,4) DEFAULT 0.0000 NOT NULL,
    remaining_credits numeric(12,4) DEFAULT 0.0000 NOT NULL,
    duration_seconds numeric(10,3) DEFAULT 0.000 NOT NULL,
    status character varying(16) DEFAULT 'queued'::character varying NOT NULL,
    error_message text,
    result_json jsonb,
    favorite_enabled boolean DEFAULT false NOT NULL,
    public_status character varying(16) DEFAULT 'private'::character varying NOT NULL,
    public_requested_at timestamp without time zone,
    public_reviewed_at timestamp without time zone,
    display_enabled boolean DEFAULT false NOT NULL,
    display_note character varying(500),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    user_deleted_at timestamp without time zone
);


--
-- Name: oauth_access_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_access_tokens (
    token_hash character(64) NOT NULL,
    client_id character varying(120) NOT NULL,
    user_id character varying(36) NOT NULL,
    scope character varying(200),
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: oauth_authorization_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_authorization_codes (
    code character varying(120) NOT NULL,
    client_id character varying(120) NOT NULL,
    user_id character varying(36) NOT NULL,
    redirect_uri character varying(500) NOT NULL,
    scope character varying(200),
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: recharge_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recharge_orders (
    id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    out_trade_no character varying(64) NOT NULL,
    trade_no character varying(80),
    order_type character varying(24) DEFAULT 'recharge'::character varying NOT NULL,
    subscription_plan_id character varying(36),
    amount numeric(12,2) NOT NULL,
    credits numeric(12,4) NOT NULL,
    status character varying(16) DEFAULT 'pending'::character varying NOT NULL,
    pay_url text,
    qr_code text,
    paid_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    recharge_rate numeric(12,4)
);


--
-- Name: redeem_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.redeem_codes (
    id character varying(36) NOT NULL,
    code character varying(80) NOT NULL,
    credits numeric(12,4) NOT NULL,
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    remark character varying(200),
    user_id character varying(36),
    used_at timestamp without time zone,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_plans (
    id character varying(36) NOT NULL,
    name character varying(80) NOT NULL,
    description character varying(300),
    amount numeric(12,2) NOT NULL,
    duration_days integer NOT NULL,
    bonus_credits numeric(12,4) DEFAULT 0.0000 NOT NULL,
    discount_percent numeric(5,2) DEFAULT 0.00 NOT NULL,
    allowed_provider_ids jsonb,
    allowed_model_ids jsonb,
    badge character varying(40),
    sort_order integer DEFAULT 0 NOT NULL,
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    concurrent_limit integer DEFAULT 1 NOT NULL,
    conversation_limit integer DEFAULT 10 NOT NULL,
    quota_images integer DEFAULT 100 NOT NULL
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    setting_key character varying(80) NOT NULL,
    setting_value text NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: user_api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_api_keys (
    id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    name character varying(80) NOT NULL,
    key_prefix character varying(20) NOT NULL,
    key_hash character varying(64) NOT NULL,
    key_plain character varying(255),
    encrypted_key text,
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    last_used_at timestamp without time zone,
    deleted_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: user_checkins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_checkins (
    id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    reward_credits numeric(12,4) NOT NULL,
    checkin_date date NOT NULL,
    user_ip character varying(64),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: user_credit_ratio_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_credit_ratio_backup (
    migration_key character varying(120) NOT NULL,
    user_id character varying(36) NOT NULL,
    email character varying(120) NOT NULL,
    credits_before numeric(12,4) NOT NULL,
    credits_after numeric(12,4) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: user_email_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_email_tokens (
    token_hash character(64) NOT NULL,
    user_id character varying(36) NOT NULL,
    purpose character varying(40) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: user_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_invites (
    id character varying(36) NOT NULL,
    inviter_id character varying(36) NOT NULL,
    invitee_id character varying(36) NOT NULL,
    reward_credits numeric(12,4) NOT NULL,
    invitee_ip character varying(64),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    reward_type character varying(20) DEFAULT 'credits'::character varying NOT NULL,
    reward_plan_id character varying(36),
    reward_label character varying(120)
);


--
-- Name: user_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_subscriptions (
    id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    plan_id character varying(36) NOT NULL,
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    started_at timestamp without time zone NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character varying(36) NOT NULL,
    email character varying(120) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(16) DEFAULT 'user'::character varying NOT NULL,
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    email_verified_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    credits numeric(12,4) DEFAULT 0.0000 NOT NULL,
    invite_code character varying(24)
);


--
-- Data for Name: ai_models; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ai_models (id, provider_id, model_name, display_name, capability, status, created_at, updated_at, price_1k, price_2k, price_4k, append_size_to_prompt, enabled_size_tiers, sort_order, cost_1k, cost_2k, cost_4k, markup_percent, price_change_percent) FROM stdin;
1c3a9c87-80be-465d-864b-be4ca3f6f77c	4e29543e-7b8a-4ee0-bea7-629e2103e287	gpt-image-2	gpt-image-2	chat_image	active	2026-06-20 12:57:42.698646	2026-06-20 12:57:42.698646	1.0000	2.0000	0.0000	t	["1k", "2k"]	100	0.0000	0.0000	0.0000	0.00	0.00
053369a2-c2ba-446c-9cf8-3dfa49353637	4e29543e-7b8a-4ee0-bea7-629e2103e287	gpt-5-5	gpt-5-5	chat_image	active	2026-06-20 12:57:42.698201	2026-06-20 12:57:42.698201	0.0000	0.0000	0.0000	f	["1k", "2k"]	100	0.0000	0.0000	0.0000	0.00	0.00
\.


--
-- Data for Name: announcement_receipts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.announcement_receipts (announcement_id, user_id, signed_at) FROM stdin;
\.


--
-- Data for Name: announcement_users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.announcement_users (announcement_id, user_id, created_at) FROM stdin;
\.


--
-- Data for Name: announcements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.announcements (id, title, content, display_mode, target_type, status, sort_order, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: api_providers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.api_providers (id, name, type, capability, base_url, api_key, status, created_at, updated_at) FROM stdin;
4e29543e-7b8a-4ee0-bea7-629e2103e287	AI-PAI	custom	chat_image	https://free-api.yccc.me	sk-l2ScWghKVZP98nx0eMS4xDPjM2KDtJQ4	active	2026-05-31 10:56:53	2026-06-04 18:56:47
\.


--
-- Data for Name: credit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.credit_logs (id, user_id, type, amount, balance_after, remark, created_at) FROM stdin;
3b0ab742-f74a-48e9-addc-f8e346d89643	9b12d5b4-e32d-4e0d-bc04-eb192f393b1e	deduct	2.0000	86.0800	图片生成：gpt-image-2	2026-07-05 11:18:22.288413
bad95ce4-bf5a-4f35-8611-11c83f4af7a1	9b12d5b4-e32d-4e0d-bc04-eb192f393b1e	deduct	2.0000	84.0800	图片生成：gpt-image-2	2026-07-05 13:40:39.986615
d3d1853e-353a-4c09-9d02-7d5077d7ebc5	9b12d5b4-e32d-4e0d-bc04-eb192f393b1e	deduct	10.0000	74.0800	图片生成：gpt-image-2	2026-07-05 13:41:22.278391
\.


--
-- Data for Name: generation_tasks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.generation_tasks (id, user_id, model_id, provider_id, capability, prompt, reference_image_url, size_tier, size, output_format, transparent_background, quantity, user_ip, cost_credits, model_cost_credits, remaining_credits, duration_seconds, status, error_message, result_json, favorite_enabled, public_status, public_requested_at, public_reviewed_at, display_enabled, display_note, created_at, updated_at, user_deleted_at) FROM stdin;
40b55d89-513d-4b51-953c-cf0fb1938c13	9b12d5b4-e32d-4e0d-bc04-eb192f393b1e	1c3a9c87-80be-465d-864b-be4ca3f6f77c	4e29543e-7b8a-4ee0-bea7-629e2103e287	chat_image	奥特曼	\N	2k	2048x2048	jpeg	f	1	127.0.0.1:52368	0.0000	0.0000	88.0800	15.538	failed	no available free image quota	\N	f	private	\N	\N	f	\N	2026-07-05 11:13:11.402467	2026-07-05 11:13:11.402467	\N
ff1eaf83-5619-4967-b55f-34de90840cca	9b12d5b4-e32d-4e0d-bc04-eb192f393b1e	1c3a9c87-80be-465d-864b-be4ca3f6f77c	4e29543e-7b8a-4ee0-bea7-629e2103e287	chat_image	奥特曼	\N	2k	2048x2048	jpeg	f	1	127.0.0.1:52368	2.0000	0.0000	86.0800	44.370	success	\N	{"data": [{"url": "https://free-api.yccc.me/images/2026/07/05/1783221501_1addb0db8e01258aeea4ead6e7eb035f.png", "type": "url"}]}	f	private	\N	\N	f	\N	2026-07-05 11:17:37.912972	2026-07-05 11:17:37.912972	\N
d296eb5d-3cef-4a99-bc34-a01fda37350e	9b12d5b4-e32d-4e0d-bc04-eb192f393b1e	1c3a9c87-80be-465d-864b-be4ca3f6f77c	4e29543e-7b8a-4ee0-bea7-629e2103e287	chat_image	奥特曼变声	["/api/tasks/ff1eaf83-5619-4967-b55f-34de90840cca/images/0","/api/tasks/ff1eaf83-5619-4967-b55f-34de90840cca/images/0"]	2k	2048x2048	jpeg	f	1	127.0.0.1:60673	0.0000	0.0000	86.0800	0.273	failed	invalid base64 image data	\N	f	private	\N	\N	f	\N	2026-07-05 11:25:18.278283	2026-07-05 11:25:18.278283	\N
882ede28-f386-4fe3-b569-c3965c06b2f7	9b12d5b4-e32d-4e0d-bc04-eb192f393b1e	1c3a9c87-80be-465d-864b-be4ca3f6f77c	4e29543e-7b8a-4ee0-bea7-629e2103e287	chat_image	奥特曼	http://127.0.0.1:3001/api/tasks/ff1eaf83-5619-4967-b55f-34de90840cca/images/0	2k	2048x2048	jpeg	f	1	127.0.0.1:58955	2.0000	0.0000	84.0800	83.222	success	\N	{"data": [{"url": "https://free-api.yccc.me/images/2026/07/05/1783230032_0983049d999bfdd18c73edffc760a646.png", "type": "url"}]}	f	private	\N	\N	f	\N	2026-07-05 13:39:16.759346	2026-07-05 13:39:16.759346	\N
00370698-6f0b-4cd5-a03a-0a4673c0659c	9b12d5b4-e32d-4e0d-bc04-eb192f393b1e	1c3a9c87-80be-465d-864b-be4ca3f6f77c	4e29543e-7b8a-4ee0-bea7-629e2103e287	chat_image	NNG	\N	2k	2048x2048	jpeg	f	5	127.0.0.1:58955	10.0000	0.0000	74.0800	109.873	success	\N	{"data": [{"url": "https://free-api.yccc.me/images/2026/07/05/1783230018_bc546d16123c7c23914d2c0f02319945.png", "type": "url"}, {"url": "https://free-api.yccc.me/images/2026/07/05/1783230022_51a2ba2cd09f6b39493a0d22c937c6cc.png", "type": "url"}, {"url": "https://free-api.yccc.me/images/2026/07/05/1783230081_3b5d424a1228cc93582364a3268d3253.png", "type": "url"}]}	f	private	\N	\N	f	\N	2026-07-05 13:39:32.399192	2026-07-05 13:39:32.399192	\N
5302a79b-1535-4cf6-9f7a-eb3171e15205	9b12d5b4-e32d-4e0d-bc04-eb192f393b1e	1c3a9c87-80be-465d-864b-be4ca3f6f77c	4e29543e-7b8a-4ee0-bea7-629e2103e287	chat_image	NNG	\N	2k	2048x2048	jpeg	f	1	127.0.0.1:62517	0.0000	0.0000	0.0000	54.368	success	\N	{"data": [{"url": "https://free-api.yccc.me/images/2026/07/05/1783239505_25eb99a1588bff5071a1f9f0d441ec1f.png", "type": "url"}]}	f	private	\N	\N	f	\N	2026-07-05 16:17:32.454349	2026-07-05 16:17:32.454349	\N
6db729c7-0b6f-4ce2-9e55-c25ced7811c5	9b12d5b4-e32d-4e0d-bc04-eb192f393b1e	1c3a9c87-80be-465d-864b-be4ca3f6f77c	4e29543e-7b8a-4ee0-bea7-629e2103e287	chat_image	BBG	\N	2k	2048x2048	jpeg	f	1	127.0.0.1:62182	0.0000	0.0000	0.0000	50.611	success	\N	{"data": [{"url": "https://free-api.yccc.me/images/2026/07/05/1783239594_0075bcc88e6b8319ad27dd76655a851f.png", "type": "url"}]}	f	private	\N	\N	f	\N	2026-07-05 16:19:05.214834	2026-07-05 16:19:05.214834	\N
02146afc-519a-4b7e-950e-928dd6aab11b	9b12d5b4-e32d-4e0d-bc04-eb192f393b1e	1c3a9c87-80be-465d-864b-be4ca3f6f77c	4e29543e-7b8a-4ee0-bea7-629e2103e287	chat_image	无畏契约	\N	2k	2048x2048	jpeg	f	1	127.0.0.1:57816	0.0000	0.0000	0.0000	55.842	success	\N	{"data": [{"url": "https://free-api.yccc.me/images/2026/07/05/1783239697_a5c77c8175be980b5f54a506a46e60bc.png", "type": "url"}]}	f	private	\N	\N	f	\N	2026-07-05 16:20:42.276284	2026-07-05 16:20:42.276284	\N
8ce80dc6-1cf2-4547-b4f3-bd4c4551a4b1	9b12d5b4-e32d-4e0d-bc04-eb192f393b1e	1c3a9c87-80be-465d-864b-be4ca3f6f77c	4e29543e-7b8a-4ee0-bea7-629e2103e287	chat_image	ook	\N	2k	2048x2048	jpeg	f	1	127.0.0.1:61563	0.0000	0.0000	0.0000	9.347	failed	你这条里只给了尺寸要求（1:1，2048×2048，2K高清），但没有说要生成什么内容。\n\n你想画的具体画面是什么？比如：人物、场景、产品、插画风格、动漫风、写实风等都可以。只要给出主体和风格，我就可以按你这个尺寸要求直接生成。	\N	f	private	\N	\N	f	\N	2026-07-05 17:10:50.591945	2026-07-05 17:10:50.591945	\N
8c14af97-5057-4a9d-a4a3-bac9ab34cbbd	9b12d5b4-e32d-4e0d-bc04-eb192f393b1e	1c3a9c87-80be-465d-864b-be4ca3f6f77c	4e29543e-7b8a-4ee0-bea7-629e2103e287	chat_image	112	\N	2k	2048x2048	jpeg	f	1	127.0.0.1:61563	0.0000	0.0000	0.0000	10.674	failed	你这边只给了尺寸和“112”，但没有说明要画什么内容。\n\n你想生成的画面主体是什么？比如：\n- 112相关的紧急救援场景（警察/救护车/消防）\n- 某个数字艺术设计（如“112”数字海报）\n- 其他具体画面（人物/城市/产品/风景）\n\n补充一句描述，我就可以按你要求的 1:1、2048×2048 高质量直接生成。	\N	f	private	\N	\N	f	\N	2026-07-05 17:11:03.616584	2026-07-05 17:11:03.616584	\N
da3143c7-720a-4533-8374-80c0a58e0966	9b12d5b4-e32d-4e0d-bc04-eb192f393b1e	1c3a9c87-80be-465d-864b-be4ca3f6f77c	4e29543e-7b8a-4ee0-bea7-629e2103e287	chat_image	NNG	\N	2k	2048x2048	jpeg	f	1	127.0.0.1:56677	0.0000	0.0000	0.0000	44.463	success	\N	{"data": [{"url": "https://free-api.yccc.me/images/2026/07/05/1783242726_0155f987c62aeb17bc8c813034b0d525.png", "type": "url"}]}	f	private	\N	\N	f	\N	2026-07-05 17:11:23.199773	2026-07-05 17:11:23.199773	\N
a625eec7-b818-4b4d-8025-8117843b1680	9b12d5b4-e32d-4e0d-bc04-eb192f393b1e	1c3a9c87-80be-465d-864b-be4ca3f6f77c	4e29543e-7b8a-4ee0-bea7-629e2103e287	chat_image	NNG	\N	2k	2048x2048	jpeg	f	1	127.0.0.1:56677	0.0000	0.0000	0.0000	42.804	success	\N	{"data": [{"url": "https://free-api.yccc.me/images/2026/07/05/1783242730_3b39f6329f0a572c15155e2b81bb79e0.png", "type": "url"}]}	f	private	\N	\N	f	\N	2026-07-05 17:11:28.88363	2026-07-05 17:11:28.88363	\N
fd4a7ff8-1df0-4f01-aa9b-8549fb121c69	9b12d5b4-e32d-4e0d-bc04-eb192f393b1e	1c3a9c87-80be-465d-864b-be4ca3f6f77c	4e29543e-7b8a-4ee0-bea7-629e2103e287	chat_image	警察/救护车/消防	\N	2k	2048x2048	jpeg	f	1	127.0.0.1:51434	0.0000	0.0000	0.0000	56.319	success	\N	{"data": [{"url": "https://free-api.yccc.me/images/2026/07/05/1783242994_5f776d9932f4c311463b5ad37b675ee2.png", "type": "url"}]}	f	private	\N	\N	f	\N	2026-07-05 17:15:39.263112	2026-07-05 17:15:39.263112	\N
\.


--
-- Data for Name: oauth_access_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.oauth_access_tokens (token_hash, client_id, user_id, scope, expires_at, created_at) FROM stdin;
\.


--
-- Data for Name: oauth_authorization_codes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.oauth_authorization_codes (code, client_id, user_id, redirect_uri, scope, expires_at, used_at, created_at) FROM stdin;
\.


--
-- Data for Name: recharge_orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.recharge_orders (id, user_id, out_trade_no, trade_no, order_type, subscription_plan_id, amount, credits, status, pay_url, qr_code, paid_at, created_at, updated_at, recharge_rate) FROM stdin;
8325a4ad-ac41-4ef9-ae45-36ef128e4d54	9b12d5b4-e32d-4e0d-bc04-eb192f393b1e	AIPI202607051715038325A4AD	2026070523001471971437445900	subscription	4c363beb-8326-4734-b1e2-6f1e861935ad	1.00	0.0000	paid	https://qr.alipay.com/bax020282p5fgvduwglr3015	https://qr.alipay.com/bax020282p5fgvduwglr3015	2026-07-05 17:15:12.919153	2026-07-05 17:15:03.717544	2026-07-05 17:15:12.91858	\N
\.


--
-- Data for Name: redeem_codes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.redeem_codes (id, code, credits, status, remark, user_id, used_at, expires_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: subscription_plans; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.subscription_plans (id, name, description, amount, duration_days, bonus_credits, discount_percent, allowed_provider_ids, allowed_model_ids, badge, sort_order, status, created_at, updated_at, concurrent_limit, conversation_limit, quota_images) FROM stdin;
4c363beb-8326-4734-b1e2-6f1e861935ad	1日卡	1日无限次数生成图片	1.00	1	0.0000	100.00	["4e29543e-7b8a-4ee0-bea7-629e2103e287"]	["1c3a9c87-80be-465d-864b-be4ca3f6f77c"]	热销	0	active	2026-07-05 13:42:35.32993	2026-07-05 15:24:10.501403	1	10	999
10f4f42d-4285-48a4-99fa-bb1f0456b6d2	30日卡	30日无限制生成图片	21.00	30	0.0000	100.00	["4e29543e-7b8a-4ee0-bea7-629e2103e287"]	["1c3a9c87-80be-465d-864b-be4ca3f6f77c"]	划算	0	active	2026-07-05 13:43:24.393221	2026-07-05 15:24:27.733495	1	10	9999
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_settings (setting_key, setting_value, updated_at) FROM stdin;
incentiveStackingMode	best	2026-06-16 01:22:39
inviteRewardType	subscription	2026-07-05 17:21:06.543574
inviteRewardPlanId	4c363beb-8326-4734-b1e2-6f1e861935ad	2026-07-05 17:21:06.543574
emailEnabled	true	2026-05-23 10:13:59
emailFromName	AIπ - AI生图站	2026-05-23 09:31:14
supportEmail		2026-05-27 08:57:35
accountPoolApiKey	YCCC-5K8fJ7dL2nQ9p36feregqqf6521R6tW1zX3cV4bN7mY2aE	2026-06-07 10:15:24
alipayGateway	https://openapi.alipay.com/gateway.do	2026-05-24 12:23:34
supportTitle	联系客服	2026-05-27 08:57:35
backendUrl	http://localhost:3001	2026-05-22 16:11:45
emailUser	ai_pais@163.com	2026-05-23 09:31:14
frontendUrl	http://localhost:5173	2026-05-22 16:11:45
supportEnabled	true	2026-05-27 08:57:35
supportWechat		2026-05-27 08:57:35
supportUrl		2026-05-27 08:57:35
logoText	AIπ	2026-05-24 13:40:33
registerMode	open	2026-05-25 22:53:25
freeGenerationQuota	100	2026-07-05 15:25:02.932953
siteName	AIπ - 在线生图站	2026-05-24 13:22:02
supportDescription	遇到充值、生成或账号问题，可以通过下面方式联系管理员。	2026-05-27 08:57:35
alipayPublicKey	MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAgZ5/IUrN9eodqxzy09HCB6qHGUlRJ7y6OK0FB1QdALUJqTYz94ax6pqQHiXT84GhtyoKNJakUuiFu+qnd1RucbfyBvH9XlpmuQd/CENeu3NpxvnYX9RwLDHriG4Adige4GD9BqzFS5WhRVfK6iaWuJGJ5htBCwc0Vbbs78sOCL+voAf8+HQA0KpVsRDvHE4hxp50FQ0hMDl8NiYV36/fvMJ2GFBQyan9AXEKNwyzTolUJ/mT6rOeoNZIQ3zmHgej5aDK4JW+ypfq/M+PWAaNu5d92i25OSFyNKAvJMJwc52qeXeWs40inGraY4NqivqTEGrAZW0PzURHRqxoqu3D+QIDAQAB	2026-05-24 12:46:51
emailPort	465	2026-05-23 00:34:56
emailPassword	RPNiadTAPJwwcScH	2026-05-23 09:31:14
supportQrCodeUrl		2026-05-27 08:57:35
accountPoolEndpoint	https://free-api.yccc.me/api/accounts	2026-05-31 12:07:46
accountPoolAuthHeader	Authorization	2026-05-31 12:07:46
inviteEnabled	true	2026-05-24 18:24:58
freeDailyGenerationQuota	10	2026-07-05 15:40:09.486497
alipayAppId	2018042760030703	2026-05-24 12:46:51
freeHourlyGenerationQuota	3	2026-07-05 15:40:09.486497
streamGenerationEnabled	false	2026-06-08 10:33:49
supportQq	3960917592	2026-05-27 13:50:50
alipayPrivateKey	MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCXE2B2z7DWxfBYYLbz+UgxW8UBP3ZsSUVWsX3RnAGkj/CJBuRFDOyRAGYgNoETMi4uk038SmX61XP41JLBdpUTPfijYU24OprxpCr9OD+G9bjjaUIwg8OYk7ayE1wU5MJff1RExULaplXtuDX1dkOGd6VNcu0dYLUDaFIxL4KQBiUA5vONIFApgLrhUNp0b2sD7Hx3CsJRpbJCQwlazyqKkyMoE9BLQ+zOUUytVN3IL/AkQW/NflebRmSIkcqMCQQdih2TRJ/6XnzG+w7NwNkrLROwQAnYtA6F1aF9Ls8LQlTVt/+ES6C1kdB4EJWOU+wvMhimFj7n/ojMYnReS0lrAgMBAAECggEAYNywlZy2Eg4Y+mEQDD8BFXx0REePQwB7b4kfVVxEBWGwY/rCMq+FobZyxCaN/WPIDl6tupts5TUkRR7t9RJ1pD+wgfgqH3ubymBqm64LtRko8M2U/YwNxW63zVbyTAcbxKTbv7gGFDBfmanpFrc7tiRSHOUZuCNAC65APH7spC/9zHkadwqjcXe4R4chNrY0gsTxczXy9zetXLN9sNMpzLzWsW4HuQ5+fPECF8tG8mh7UxJ+3uQgGwF3qlXllzv3FvkjyWGNkumAvZBVwHDPaQBF1QmPloNmi5Q/b5jO6eLtCapd7Eawk9FRQlj8wb4ylr5UbvDM0oHl73TKZIFwqQKBgQDhlccrbPUA2jyg6DlJsLmDlL0gx3tEh/mLGd2NADhcOBTrcRZFV4IQHCKjm9ySDHfUgjeBhtMlkQhyf970JdxSoSmFKZJ11kXZ8iW75LBG9xy+JmBreHdMLzXglHrYgM3ahuumZGVHyJYTYJhgVDakwrauVrRFZHqvt4DnnKqIRQKBgQCrcdtgL+GNH5EmBb5fhRoGyt/DvpN3+wrCc+6R/5+FPldgHMd4mFHqXvlmVRgdisBUDVQYSyWQIBq6EESjGxAl5sArakp7p9PRR7HEJxnegCxLJiSt4X7Zmw5ZrD7sYWSEE5hZ7+S1mflTVyWM8r3AwYJfLv5gT3AtwkGo3xFd7wKBgBZ1sB/NuFL+Z3zpwhJpKv9DxtTFp6s6Eolb6OgJ9pKP7t1GJB6BSOzLsFMzyHEuFpws3tPhlZIu73Ve79bFEjuT2its6S0cSVYautELQtW98rmn3n+0vcPzC10xy01U/andNwcZBdBw0yhYvLMSj2I2FLQk48vo5iIqlgX5Xi01AoGBAJdhSi4NOSANznD/Q1A+S3PR8HB7NuUK4j4+dVmulyDkoev4nVxrSnEieR6VZly3ZgkRV763o6w13MOLl79ZJxIARJBRIwE6d/pjTqB/UgU3sWSNgneSExp7IdmmEE1R1ZoVX0GSY6TCFvcyjLJ+p3Oqqb331Z4eplORIb7FcCU7AoGAclxUox25x1OiZ7rHk8+yWtvJxuXLNgy+a+ViFHgcvKe9drUTQ/O0Z/zvd/8lZ3GWYPATpN1AZrSnKpfylO43A6dX/oHFa4ybljWI5ilugFq6QgI087m/D60emCFmnzZLgFcG/tGACDaNMaHMMO5BFhDxYMVy0UTLWRS7ZEXJ1+M=	2026-05-24 12:46:51
emailHost	smtp.163.com	2026-05-23 09:31:14
emailSecure	true	2026-05-23 00:34:56
registerEmailVerification	true	2026-05-25 22:53:22
taskTimeoutMinutes	10	2026-05-27 16:26:50
emailFromAddress	ai_pais@163.com	2026-05-23 09:31:14
\.


--
-- Data for Name: user_api_keys; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_api_keys (id, user_id, name, key_prefix, key_hash, key_plain, encrypted_key, status, last_used_at, deleted_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: user_checkins; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_checkins (id, user_id, reward_credits, checkin_date, user_ip, created_at) FROM stdin;
\.


--
-- Data for Name: user_credit_ratio_backup; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_credit_ratio_backup (migration_key, user_id, email, credits_before, credits_after, created_at) FROM stdin;
\.


--
-- Data for Name: user_email_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_email_tokens (token_hash, user_id, purpose, expires_at, used_at, created_at) FROM stdin;
5a45b54dbb7fe4ece21e2b3a9a3d8b1f93074c12ae91f3cc4b85355cf269e7b8	019972a8-fb54-4cb7-a222-824fe00a00c0	verify_email	2026-07-06 18:58:36.67765	2026-07-05 18:59:56.376888	2026-07-05 18:58:36.679194
\.


--
-- Data for Name: user_invites; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_invites (id, inviter_id, invitee_id, reward_credits, invitee_ip, created_at, reward_type, reward_plan_id, reward_label) FROM stdin;
0724347e-38b0-4802-9102-ea613f381f1d	9b12d5b4-e32d-4e0d-bc04-eb192f393b1e	019972a8-fb54-4cb7-a222-824fe00a00c0	0.0000	127.0.0.1:55653	2026-07-05 18:58:36.666208	subscription	4c363beb-8326-4734-b1e2-6f1e861935ad	1日卡
\.


--
-- Data for Name: user_subscriptions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_subscriptions (id, user_id, plan_id, status, started_at, expires_at, created_at, updated_at) FROM stdin;
80ef4b7e-b179-4d58-9f46-6b11f626fb66	9b12d5b4-e32d-4e0d-bc04-eb192f393b1e	4c363beb-8326-4734-b1e2-6f1e861935ad	active	2026-07-05 18:58:36.668187	2026-07-08 17:15:12.919153	2026-07-05 17:15:12.91858	2026-07-05 18:58:36.666208
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, password_hash, role, status, email_verified_at, created_at, updated_at, credits, invite_code) FROM stdin;
9b12d5b4-e32d-4e0d-bc04-eb192f393b1e	admin@local.com	$2a$10$we60QqmiubZSAAUKDc7EKuqUbFcVUNLe7z6GrXGwWdcGSvK1pd5RW	admin	active	2026-06-23 21:34:10.403716	2026-06-23 21:34:10.461921	2026-07-05 20:00:31.476702	74.0800	5DJF4TDR
019972a8-fb54-4cb7-a222-824fe00a00c0	486861634@qq.com	$2a$10$CGa88ZHBotzbT1RQ0Xk9GuvEMcX3XADnwvrMnjEnknOJ2GdiVfMxu	user	active	2026-07-05 18:59:56.385241	2026-07-05 18:58:36.660606	2026-07-05 18:58:36.660606	0.0000	MBFJYV3G
\.


--
-- Name: ai_models ai_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_models
    ADD CONSTRAINT ai_models_pkey PRIMARY KEY (id);


--
-- Name: announcement_receipts announcement_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_receipts
    ADD CONSTRAINT announcement_receipts_pkey PRIMARY KEY (announcement_id, user_id);


--
-- Name: announcement_users announcement_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_users
    ADD CONSTRAINT announcement_users_pkey PRIMARY KEY (announcement_id, user_id);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: api_providers api_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_providers
    ADD CONSTRAINT api_providers_pkey PRIMARY KEY (id);


--
-- Name: credit_logs credit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_logs
    ADD CONSTRAINT credit_logs_pkey PRIMARY KEY (id);


--
-- Name: generation_tasks generation_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generation_tasks
    ADD CONSTRAINT generation_tasks_pkey PRIMARY KEY (id);


--
-- Name: oauth_access_tokens oauth_access_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_access_tokens
    ADD CONSTRAINT oauth_access_tokens_pkey PRIMARY KEY (token_hash);


--
-- Name: oauth_authorization_codes oauth_authorization_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_authorization_codes
    ADD CONSTRAINT oauth_authorization_codes_pkey PRIMARY KEY (code);


--
-- Name: recharge_orders recharge_orders_out_trade_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recharge_orders
    ADD CONSTRAINT recharge_orders_out_trade_no_key UNIQUE (out_trade_no);


--
-- Name: recharge_orders recharge_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recharge_orders
    ADD CONSTRAINT recharge_orders_pkey PRIMARY KEY (id);


--
-- Name: redeem_codes redeem_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redeem_codes
    ADD CONSTRAINT redeem_codes_code_key UNIQUE (code);


--
-- Name: redeem_codes redeem_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redeem_codes
    ADD CONSTRAINT redeem_codes_pkey PRIMARY KEY (id);


--
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (setting_key);


--
-- Name: ai_models uq_ai_models_provider_model_capability; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_models
    ADD CONSTRAINT uq_ai_models_provider_model_capability UNIQUE (provider_id, model_name, capability);


--
-- Name: user_checkins uq_user_checkins_user_date; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_checkins
    ADD CONSTRAINT uq_user_checkins_user_date UNIQUE (user_id, checkin_date);


--
-- Name: user_api_keys user_api_keys_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_api_keys
    ADD CONSTRAINT user_api_keys_key_hash_key UNIQUE (key_hash);


--
-- Name: user_api_keys user_api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_api_keys
    ADD CONSTRAINT user_api_keys_pkey PRIMARY KEY (id);


--
-- Name: user_checkins user_checkins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_checkins
    ADD CONSTRAINT user_checkins_pkey PRIMARY KEY (id);


--
-- Name: user_credit_ratio_backup user_credit_ratio_backup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_credit_ratio_backup
    ADD CONSTRAINT user_credit_ratio_backup_pkey PRIMARY KEY (migration_key, user_id);


--
-- Name: user_email_tokens user_email_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_email_tokens
    ADD CONSTRAINT user_email_tokens_pkey PRIMARY KEY (token_hash);


--
-- Name: user_invites user_invites_invitee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invites
    ADD CONSTRAINT user_invites_invitee_id_key UNIQUE (invitee_id);


--
-- Name: user_invites user_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invites
    ADD CONSTRAINT user_invites_pkey PRIMARY KEY (id);


--
-- Name: user_subscriptions user_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: user_subscriptions user_subscriptions_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_user_id_key UNIQUE (user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_ai_models_status_capability; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_models_status_capability ON public.ai_models USING btree (status, capability);


--
-- Name: idx_announcement_receipts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_announcement_receipts_user_id ON public.announcement_receipts USING btree (user_id);


--
-- Name: idx_announcement_users_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_announcement_users_user_id ON public.announcement_users USING btree (user_id);


--
-- Name: idx_announcements_status_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_announcements_status_sort ON public.announcements USING btree (status, sort_order, created_at);


--
-- Name: idx_credit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_logs_created_at ON public.credit_logs USING btree (created_at);


--
-- Name: idx_credit_logs_type_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_logs_type_created_at ON public.credit_logs USING btree (type, created_at);


--
-- Name: idx_credit_logs_user_created_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_logs_user_created_id ON public.credit_logs USING btree (user_id, created_at, id);


--
-- Name: idx_credit_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_logs_user_id ON public.credit_logs USING btree (user_id);


--
-- Name: idx_credit_logs_user_id_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_logs_user_id_created_at ON public.credit_logs USING btree (user_id, created_at);


--
-- Name: idx_generation_tasks_capability; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generation_tasks_capability ON public.generation_tasks USING btree (capability);


--
-- Name: idx_generation_tasks_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generation_tasks_created_at ON public.generation_tasks USING btree (created_at);


--
-- Name: idx_generation_tasks_created_at_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generation_tasks_created_at_user_id ON public.generation_tasks USING btree (created_at, user_id);


--
-- Name: idx_generation_tasks_public_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generation_tasks_public_status ON public.generation_tasks USING btree (public_status, updated_at);


--
-- Name: idx_generation_tasks_public_status_display_enabled_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generation_tasks_public_status_display_enabled_created_at ON public.generation_tasks USING btree (public_status, display_enabled, created_at);


--
-- Name: idx_generation_tasks_status_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generation_tasks_status_created_at ON public.generation_tasks USING btree (status, created_at);


--
-- Name: idx_generation_tasks_user_created_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generation_tasks_user_created_id ON public.generation_tasks USING btree (user_id, created_at, id);


--
-- Name: idx_generation_tasks_user_favorite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generation_tasks_user_favorite ON public.generation_tasks USING btree (user_id, favorite_enabled, updated_at);


--
-- Name: idx_generation_tasks_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generation_tasks_user_id ON public.generation_tasks USING btree (user_id);


--
-- Name: idx_generation_tasks_user_id_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generation_tasks_user_id_created_at ON public.generation_tasks USING btree (user_id, created_at);


--
-- Name: idx_oauth_codes_client_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_codes_client_user ON public.oauth_authorization_codes USING btree (client_id, user_id);


--
-- Name: idx_oauth_codes_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_codes_expires_at ON public.oauth_authorization_codes USING btree (expires_at);


--
-- Name: idx_oauth_tokens_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_tokens_expires_at ON public.oauth_access_tokens USING btree (expires_at);


--
-- Name: idx_oauth_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_tokens_user_id ON public.oauth_access_tokens USING btree (user_id);


--
-- Name: idx_recharge_orders_out_trade_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recharge_orders_out_trade_no ON public.recharge_orders USING btree (out_trade_no);


--
-- Name: idx_recharge_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recharge_orders_status ON public.recharge_orders USING btree (status);


--
-- Name: idx_recharge_orders_status_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recharge_orders_status_created_at ON public.recharge_orders USING btree (status, created_at);


--
-- Name: idx_recharge_orders_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recharge_orders_user_id ON public.recharge_orders USING btree (user_id);


--
-- Name: idx_recharge_orders_user_id_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recharge_orders_user_id_created_at ON public.recharge_orders USING btree (user_id, created_at);


--
-- Name: idx_redeem_codes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_redeem_codes_status ON public.redeem_codes USING btree (status);


--
-- Name: idx_redeem_codes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_redeem_codes_user_id ON public.redeem_codes USING btree (user_id);


--
-- Name: idx_subscription_plans_status_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscription_plans_status_sort ON public.subscription_plans USING btree (status, sort_order);


--
-- Name: idx_user_api_keys_prefix_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_api_keys_prefix_status ON public.user_api_keys USING btree (key_prefix, status);


--
-- Name: idx_user_api_keys_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_api_keys_user_id ON public.user_api_keys USING btree (user_id);


--
-- Name: idx_user_checkins_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_checkins_date ON public.user_checkins USING btree (checkin_date);


--
-- Name: idx_user_checkins_user_id_checkin_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_checkins_user_id_checkin_date ON public.user_checkins USING btree (user_id, checkin_date);


--
-- Name: idx_user_email_tokens_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_email_tokens_expires_at ON public.user_email_tokens USING btree (expires_at);


--
-- Name: idx_user_email_tokens_purpose; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_email_tokens_purpose ON public.user_email_tokens USING btree (purpose);


--
-- Name: idx_user_email_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_email_tokens_user_id ON public.user_email_tokens USING btree (user_id);


--
-- Name: idx_user_invites_invitee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_invites_invitee_id ON public.user_invites USING btree (invitee_id);


--
-- Name: idx_user_invites_inviter_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_invites_inviter_id ON public.user_invites USING btree (inviter_id);


--
-- Name: idx_user_invites_ip_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_invites_ip_created ON public.user_invites USING btree (invitee_ip, created_at);


--
-- Name: idx_user_subscriptions_plan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_subscriptions_plan_id ON public.user_subscriptions USING btree (plan_id);


--
-- Name: idx_user_subscriptions_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_subscriptions_user_status ON public.user_subscriptions USING btree (user_id, status, expires_at);


--
-- Name: idx_users_invite_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_users_invite_code ON public.users USING btree (invite_code);


--
-- Name: uq_users_invite_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_users_invite_code ON public.users USING btree (invite_code);


--
-- PostgreSQL database dump complete
--

\unrestrict v62Lv3YrVWuwkf7g24sTbutecEr2LKc20glWT98cRRRKgkFtSKDOszAnZuUmLG3

