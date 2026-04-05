import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function getArgValue(flagName) {
  const args = process.argv.slice(2);
  const index = args.indexOf(flagName);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const version = packageJson.version;
const tagName = `v${version}`;
const repositorySlug = process.env.GITHUB_REPOSITORY || "buftio/telec";
const checksumsPath =
  getArgValue("--checksums") ||
  path.join(repoRoot, ".local", "releases", tagName, "checksums.json");
const outputPath =
  getArgValue("--output") || path.join(repoRoot, ".local", "releases", tagName, "telec.rb");
const checksums = JSON.parse(readFileSync(checksumsPath, "utf8"));
const darwinArm64 = checksums.targets["darwin-arm64"];
const linuxX64 = checksums.targets["linux-x64"];

if (!darwinArm64 || !linuxX64) {
  console.error("Missing checksums for one or more Homebrew targets.");
  process.exit(1);
}

const formula = `class Telec < Formula
  desc "Scriptable Telegram CLI on top of TDLib"
  homepage "https://github.com/${repositorySlug}"
  version "${version}"
  license "MIT"

  livecheck do
    url :stable
    strategy :github_latest
  end

  depends_on "tdlib"

  on_macos do
    on_arm do
      url "https://github.com/${repositorySlug}/releases/download/${tagName}/${darwinArm64.archiveName}"
      sha256 "${darwinArm64.sha256}"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/${repositorySlug}/releases/download/${tagName}/${linuxX64.archiveName}"
      sha256 "${linuxX64.sha256}"
    end
  end

  def install
    bin.install "telec"
  end

  test do
    assert_match "Scriptable Telegram CLI on top of TDLib", shell_output("#{bin}/telec --help")
  end
end
`;

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, formula);
process.stdout.write(formula);
