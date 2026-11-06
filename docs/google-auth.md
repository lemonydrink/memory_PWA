# Googleログインの設定

この版はGoogle OAuth / OpenID ConnectとCloudflare D1を使用します。設定がない場合は503で停止し、アプリを公開しません。Cloudflare Accessの設定は必須ではありません。R2クラウドバックアップはまだ含みません。

## 1. D1を作る

CloudflareでD1データベースを作成し、D1コンソールで `migrations/0001_auth.sql` のSQLを実行してください（またはWranglerでファイルを実行）。Pagesプロジェクトの設定 → Bindingsで、D1を **DB** という変数名で接続します。設定変更後は再デプロイします。

設定の管理元を混在させないため、本版では自動読込される `wrangler.toml` を置かず、CloudflareダッシュボードでBindingsを管理します。`wrangler.example.toml` はローカル開発用です。

許可するメールアドレスを事前登録します。実際のアドレスへ置き換えてください。

```sql
INSERT INTO allowed_accounts (email) VALUES ('your-email@gmail.com');
```

メールは小文字で登録してください。初回ログイン時にGoogleの不変ID（sub）へ紐付けます。以後メールアドレスが同じでも別のGoogle IDでは利用できません。ログイン画面からの新規登録はありません。

無効化は次のとおり。ログインCookieが残っていても次回のリクエストから拒否します。開いている画面は復帰時・最大約1分の定期確認でロックされます。

```sql
UPDATE allowed_accounts SET enabled = 0 WHERE email = 'your-email@gmail.com';
DELETE FROM sessions WHERE email = 'your-email@gmail.com';
```

再許可は `enabled = 1` にします。Googleアカウントそのものを変更する場合は、対象者を確認してgoogle_subをNULLに戻し、既存セッションも削除してください。

## 2. Google Cloudを設定

Google Cloud Consoleでプロジェクトを作成し、Google Auth Platformのブランディング・対象ユーザー・データアクセスを設定。OAuthクライアントIDを「ウェブアプリケーション」として作成します。スコープは `openid` と `email` のみです。テスト公開の場合は利用するアカウントをテストユーザーにも追加します。D1の許可リストとは別の設定です。

承認済みのリダイレクトURIを **完全一致** で追加します。

```text
https://your-app.pages.dev/auth/callback
```

独自ドメインを使う場合は、そのURLに統一してください。認証・端末データ・Cookieはドメインごとに分かれます。ブラウザにクライアントシークレットを渡す必要はありません。

## 3. Pagesの変数・シークレット

PagesのSettings → Variables and Secretsに次を設定します。

| 名前 | 種類 | 内容 |
| --- | --- | --- |
| GOOGLE_CLIENT_ID | 変数 | GoogleのクライアントID |
| GOOGLE_CLIENT_SECRET | シークレット | Googleのクライアントシークレット |
| APP_ORIGIN | 変数 | `https://your-app.pages.dev`（末尾の `/` なし） |
| SESSION_DAYS | 変数 | `90`（1～90日） |

Pagesの **Settings → Runtime → Fail open / closed** は **Fail closed** にしてください。利用枠を使い切った場合も、認証を迂回して静的ファイルを配信させないためです。

本番ブランチmain、フレームワークNone、ビルド空欄、出力publicで再デプロイします。public/_worker.js がPagesのadvanced modeとしてサーバー上で動作し、全ルートを認証します。_worker.jsを単なる静的ホスティングに配信しないでください。設定したAPP_ORIGIN以外のプレビューURLは利用を拒否します。プレビューも使う場合は、独立したDB・OAuthクライアント・環境変数を用意してください。

## 4. 動作確認

1. 未ログインでアクセスするとログイン画面に進む。
2. 許可したGoogleアカウントでログインできる。
3. 未許可アカウントは拒否される。
4. 同じブラウザで開き直すとGoogleログインを省略する。
5. ログアウト後は再ログインが必要になる。
6. D1でenabledを0にすると、既存Cookieがあってもアクセスできない。
7. オフライン時は画面がロックされる。

セッションはランダムな256bitトークンをSecure / HttpOnly / SameSite=LaxのCookieに保存し、D1にはSHA-256ハッシュのみ保存します。最大90日間の固定期限で、自動延長しません。Cookie削除、ブラウザの保存制限、Google側の再認証要求などにより早く再ログインが必要になる場合があります。Googleのパスワード変更でアプリ独自のセッションが必ず失効するわけではありません。管理者はD1のsessions削除で失効させてください。

## 端末データとオフラインの変更

端末教材はGoogleのsubごとに分けて保存します。認証導入前の教材は削除せず、「認証追加前の教材を取り込む」から本人が確認して現在のアカウントへコピーできます。初回更新前に旧版でJSONバックアップも保存してください。ログアウトは教材を端末から削除しません。共有端末から教材を完全に消す場合はサイトデータも削除してください。

権限の確認を優先するため、従来のオフライン起動は停止しました。Service Workerを更新して旧キャッシュを削除します。ただし、すでにオフラインの旧版をサーバーから強制更新することはできません。既存利用者にはオンラインで旧画面を閉じて開き直すよう案内してください。ブラウザ内のデータ自体を暗号化する機能ではありません。端末を操作できる人からの保護にはOSのロックも必要です。

## 参考

- https://developers.google.com/identity/openid-connect/openid-connect
- https://developers.cloudflare.com/pages/functions/bindings/
- https://developers.cloudflare.com/pages/functions/advanced-mode/
