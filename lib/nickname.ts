// 같은 글에서 글쓴이와 번호가 같으면 '글쓴이'로 보여준다 (같은 기기면 같은 번호가 나오기 때문)
export function displayNickname(nickname: string, authorNickname: string | undefined) {
  return authorNickname && nickname === authorNickname ? "✍️ 글쓴이" : nickname;
}
