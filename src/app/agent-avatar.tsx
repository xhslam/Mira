import { Image } from "react-native";

const avatars = [
  require("../../assets/branding/agent-avatars/basic.png") as number,
  require("../../assets/branding/agent-avatars/outlined.png") as number,
  require("../../assets/branding/agent-avatars/happy.png") as number,
  require("../../assets/branding/agent-avatars/focused.png") as number,
  require("../../assets/branding/agent-avatars/academic.png") as number,
  require("../../assets/branding/agent-avatars/coding.png") as number,
  require("../../assets/branding/agent-avatars/explorer.png") as number,
  require("../../assets/branding/agent-avatars/sporty.png") as number,
  require("../../assets/branding/agent-avatars/calm.png") as number,
  require("../../assets/branding/agent-avatars/sparkle.png") as number,
] as const;

export function agentAvatarSource(id: string | null): number {
  const hash = [...(id ?? "")].reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    0,
  );
  return avatars[hash % avatars.length] ?? avatars[0];
}

export function pickAgentAvatar(): number {
  return avatars[Math.floor(Math.random() * avatars.length)] ?? avatars[0];
}

export function AgentAvatar({ source, size }: Readonly<{ source: number; size: number }>) {
  return (
    <Image
      accessible={false}
      importantForAccessibility="no"
      resizeMode="contain"
      source={source}
      style={{ width: size, height: size }}
    />
  );
}
