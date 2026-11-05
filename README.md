# 오늘 뭐먹지?

`index.html`과 `menu.json`을 같은 폴더에서 정적 웹 서버로 실행합니다.
월별 제철 재료, 레시피 상세 팝업, 메뉴가 15개 이하인 달의 랜덤 추가 추천을 제공합니다.

## Supabase 이메일 인증 연결

현재 인증 UI와 클라이언트 로직은 구현되어 있으며, Supabase 프로젝트 연결 정보는 비어 있습니다.
연결 전에는 인증 요청 버튼이 비활성화됩니다. 레시피 조회는 계속 사용할 수 있습니다.

1. Supabase 프로젝트의 Connect 또는 API 설정에서 프로젝트 URL과 공개용 publishable key(또는 legacy anon key)를 확인합니다.
2. `index.html`의 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`에 각각 입력합니다. 이 설정은 브라우저에 공개됩니다. secret key, service_role 키, 데이터베이스 비밀번호를 넣지 마세요.
3. Supabase Authentication에서 이메일·비밀번호 가입을 활성화합니다. 이메일 확인을 사용하는 경우 가입 안내 메일의 링크를 누른 뒤 로그인합니다.
4. Authentication의 URL Configuration에서 Site URL을 실제 운영 주소로 설정하고, 사용하는 로컬·운영 주소를 Redirect URLs에 등록합니다. 로컬 주소는 `http://127.0.0.1:8000/`입니다.
5. 실제 테스트 계정으로 가입, 이메일 확인, 로그인, 새로고침 후 세션 복원, 로그아웃을 검증합니다.

supabase-js v2는 jsDelivr CDN에서 로드합니다. 세션 유지·토큰 갱신과 인증 상태 변경에 따라 상단 이메일·로그아웃 표시를 갱신합니다.
로그아웃은 현재 브라우저 세션에 적용됩니다. 이메일 또는 비밀번호를 저장소에 기록하지 마세요.

## 테스트

프로젝트 폴더에서 `node --test tests/auth.test.cjs`를 실행합니다.
이 테스트는 모의 Supabase 클라이언트를 사용하므로, 실제 프로젝트 연결과 이메일 발송 검증은 별도로 필요합니다.

공식 문서: [CDN 설치](https://supabase.com/docs/reference/javascript/installing), [이메일 인증](https://supabase.com/docs/guides/auth/passwords).
