import { useCallback, useEffect, useState, useRef } from "react";
import {
  Input,
  Typography,
  Tag,
  Progress,
  Tooltip,
  message,
  Spin,
  Empty,
} from "antd";
import {
  SearchOutlined,
  DownloadOutlined,
  FireOutlined,
  ThunderboltOutlined,
  CodeOutlined,
  GlobalOutlined,
  RobotOutlined,
  CheckCircleFilled,
  CloudDownloadOutlined,
  StarFilled,
  ExperimentOutlined,
  EyeOutlined,
  ApiOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { useServerStore, API_BASE, PLUGIN_ID } from "../stores/serverStore";

const { Text, Title } = Typography;

/* ------------------------------------------------------------------ */
/*  Curated catalog — models that fit below a 4090 (24 GB VRAM)       */
/* ------------------------------------------------------------------ */

interface CatalogModel {
  id: string;
  name: string;
  author: string;
  repo: string;
  file: string;
  description: string;
  params: string;
  sizeLabel: string;
  sizeMb: number;
  context: string;
  quantization: string;
  category: string[];
  featured?: boolean;
  likes?: number;
  vramEstimate?: string;
}

const CATALOG: CatalogModel[] = [
  // -- Tiny (< 1 GB) ------------------------------------------------
  {
    id: "qwen25-05b",
    name: "Qwen 2.5 0.5B",
    author: "Qwen",
    repo: "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
    file: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
    description:
      "Ultra-lightweight model. Perfect for testing and experimentation on any hardware.",
    params: "0.5B",
    sizeLabel: "469 MB",
    sizeMb: 469,
    context: "32K",
    quantization: "Q4_K_M",
    category: ["tiny", "multilingual"],
    likes: 892,
    vramEstimate: "~0.5 GB",
  },
  {
    id: "llama32-1b",
    name: "Llama 3.2 1B",
    author: "Meta / bartowski",
    repo: "bartowski/Llama-3.2-1B-Instruct-GGUF",
    file: "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    description:
      "Meta's smallest Llama model. Fast inference, ideal for embedded or edge use cases.",
    params: "1B",
    sizeLabel: "770 MB",
    sizeMb: 770,
    context: "128K",
    quantization: "Q4_K_M",
    category: ["tiny"],
    likes: 1420,
    vramEstimate: "~0.8 GB",
  },
  // -- Small (1–3 GB) ------------------------------------------------
  {
    id: "qwen25-15b",
    name: "Qwen 2.5 1.5B",
    author: "Qwen",
    repo: "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
    file: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
    description:
      "Excellent multilingual capabilities in a compact package. Supports 29+ languages.",
    params: "1.5B",
    sizeLabel: "1.1 GB",
    sizeMb: 1100,
    context: "32K",
    quantization: "Q4_K_M",
    category: ["small", "multilingual"],
    likes: 2150,
    vramEstimate: "~1.2 GB",
  },
  {
    id: "llama32-3b",
    name: "Llama 3.2 3B",
    author: "Meta / bartowski",
    repo: "bartowski/Llama-3.2-3B-Instruct-GGUF",
    file: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    description:
      "Great balance of capability and speed. Excellent for on-device AI applications.",
    params: "3B",
    sizeLabel: "2.0 GB",
    sizeMb: 2000,
    context: "128K",
    quantization: "Q4_K_M",
    category: ["small"],
    featured: true,
    likes: 3200,
    vramEstimate: "~2.2 GB",
  },
  {
    id: "phi4-mini",
    name: "Phi-4 Mini 3.8B",
    author: "Microsoft / bartowski",
    repo: "bartowski/phi-4-mini-instruct-GGUF",
    file: "phi-4-mini-instruct-Q4_K_M.gguf",
    description:
      "Microsoft's latest small-but-mighty model. Exceptional reasoning for its size.",
    params: "3.8B",
    sizeLabel: "2.5 GB",
    sizeMb: 2500,
    context: "128K",
    quantization: "Q4_K_M",
    category: ["small", "reasoning"],
    featured: true,
    likes: 4100,
    vramEstimate: "~2.8 GB",
  },
  {
    id: "gemma3-4b",
    name: "Gemma 3 4B",
    author: "Google / bartowski",
    repo: "bartowski/google_gemma-3-4b-it-GGUF",
    file: "google_gemma-3-4b-it-Q4_K_M.gguf",
    description:
      "Google's efficient Gemma 3 model. Strong multilingual and instruction following.",
    params: "4B",
    sizeLabel: "2.8 GB",
    sizeMb: 2800,
    context: "128K",
    quantization: "Q4_K_M",
    category: ["small", "multilingual"],
    likes: 2800,
    vramEstimate: "~3.0 GB",
  },
  // -- Medium (3–8 GB) -----------------------------------------------
  {
    id: "qwen25-7b",
    name: "Qwen 2.5 7B",
    author: "Qwen",
    repo: "Qwen/Qwen2.5-7B-Instruct-GGUF",
    file: "qwen2.5-7b-instruct-q4_k_m.gguf",
    description:
      "Powerhouse multilingual model. Competitive with much larger models on benchmarks.",
    params: "7B",
    sizeLabel: "4.7 GB",
    sizeMb: 4700,
    context: "128K",
    quantization: "Q4_K_M",
    category: ["medium", "multilingual"],
    featured: true,
    likes: 5600,
    vramEstimate: "~5.2 GB",
  },
  {
    id: "qwen3-8b",
    name: "Qwen 3 8B",
    author: "Qwen / bartowski",
    repo: "bartowski/Qwen_Qwen3-8B-GGUF",
    file: "Qwen_Qwen3-8B-Q4_K_M.gguf",
    description:
      "Latest Qwen 3 generation with hybrid thinking. State-of-the-art for 8B class.",
    params: "8B",
    sizeLabel: "5.2 GB",
    sizeMb: 5200,
    context: "128K",
    quantization: "Q4_K_M",
    category: ["medium", "reasoning"],
    featured: true,
    likes: 6100,
    vramEstimate: "~5.8 GB",
  },
  {
    id: "llama31-8b",
    name: "Llama 3.1 8B",
    author: "Meta / bartowski",
    repo: "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF",
    file: "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    description:
      "Meta's workhorse model. Great all-around performance for chat, coding, and reasoning.",
    params: "8B",
    sizeLabel: "4.9 GB",
    sizeMb: 4900,
    context: "128K",
    quantization: "Q4_K_M",
    category: ["medium"],
    likes: 8200,
    vramEstimate: "~5.4 GB",
  },
  {
    id: "deepseek-coder-v2-lite",
    name: "DeepSeek Coder V2 Lite",
    author: "DeepSeek / bartowski",
    repo: "bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF",
    file: "DeepSeek-Coder-V2-Lite-Instruct-Q4_K_M.gguf",
    description:
      "Focused on code generation and understanding. MoE architecture for efficient inference.",
    params: "16B (2.4B active)",
    sizeLabel: "8.9 GB",
    sizeMb: 8900,
    context: "128K",
    quantization: "Q4_K_M",
    category: ["medium", "coding"],
    likes: 3800,
    vramEstimate: "~9.5 GB",
  },
  {
    id: "gemma3-12b",
    name: "Gemma 3 12B",
    author: "Google / bartowski",
    repo: "bartowski/google_gemma-3-12b-it-GGUF",
    file: "google_gemma-3-12b-it-Q4_K_M.gguf",
    description:
      "Google's mid-range Gemma model. Strong reasoning and multilingual capabilities.",
    params: "12B",
    sizeLabel: "7.8 GB",
    sizeMb: 7800,
    context: "128K",
    quantization: "Q4_K_M",
    category: ["medium", "multilingual", "reasoning"],
    likes: 3400,
    vramEstimate: "~8.5 GB",
  },
  // -- Large (8–16 GB, still fits 4090) ------------------------------
  {
    id: "qwen25-14b",
    name: "Qwen 2.5 14B",
    author: "Qwen",
    repo: "Qwen/Qwen2.5-14B-Instruct-GGUF",
    file: "qwen2.5-14b-instruct-q4_k_m.gguf",
    description:
      "Premium-tier model that fits in a 4090. Exceptional coding and multilingual quality.",
    params: "14B",
    sizeLabel: "9.0 GB",
    sizeMb: 9000,
    context: "128K",
    quantization: "Q4_K_M",
    category: ["large", "coding", "multilingual"],
    featured: true,
    likes: 4800,
    vramEstimate: "~10.2 GB",
  },
  {
    id: "qwen3-14b",
    name: "Qwen 3 14B",
    author: "Qwen / bartowski",
    repo: "bartowski/Qwen_Qwen3-14B-GGUF",
    file: "Qwen_Qwen3-14B-Q4_K_M.gguf",
    description:
      "Latest Qwen 3 14B with hybrid thinking mode. Top-tier quality for under 24 GB.",
    params: "14B",
    sizeLabel: "9.3 GB",
    sizeMb: 9300,
    context: "128K",
    quantization: "Q4_K_M",
    category: ["large", "reasoning"],
    featured: true,
    likes: 5200,
    vramEstimate: "~10.5 GB",
  },
  {
    id: "mistral-nemo-12b",
    name: "Mistral Nemo 12B",
    author: "Mistral / bartowski",
    repo: "bartowski/Mistral-Nemo-Instruct-2407-GGUF",
    file: "Mistral-Nemo-Instruct-2407-Q4_K_M.gguf",
    description:
      "Mistral & NVIDIA collaboration. Great for RAG, tool-use, and multi-turn conversations.",
    params: "12B",
    sizeLabel: "7.1 GB",
    sizeMb: 7100,
    context: "128K",
    quantization: "Q4_K_M",
    category: ["large", "tool-use"],
    likes: 3600,
    vramEstimate: "~7.8 GB",
  },
  {
    id: "qwen25-coder-14b",
    name: "Qwen 2.5 Coder 14B",
    author: "Qwen",
    repo: "Qwen/Qwen2.5-Coder-14B-Instruct-GGUF",
    file: "qwen2.5-coder-14b-instruct-q4_k_m.gguf",
    description:
      "Code-specialized model with top-tier HumanEval scores. Fits fully in 4090 VRAM.",
    params: "14B",
    sizeLabel: "9.0 GB",
    sizeMb: 9000,
    context: "128K",
    quantization: "Q4_K_M",
    category: ["large", "coding"],
    featured: true,
    likes: 5100,
    vramEstimate: "~10.2 GB",
  },
  // -- XL (16–24 GB, tight 4090 fit) ---------------------------------
  {
    id: "qwen3-30b-a3b",
    name: "Qwen 3 30B-A3B (MoE)",
    author: "Qwen / bartowski",
    repo: "bartowski/Qwen_Qwen3-30B-A3B-GGUF",
    file: "Qwen_Qwen3-30B-A3B-Q4_K_M.gguf",
    description:
      "MoE architecture — 30B total params but only 3B active. Fast like a 3B, smart like a 30B.",
    params: "30B (3B active)",
    sizeLabel: "18 GB",
    sizeMb: 18000,
    context: "128K",
    quantization: "Q4_K_M",
    category: ["xl", "reasoning"],
    featured: true,
    likes: 7200,
    vramEstimate: "~19 GB",
  },
  {
    id: "gemma3-27b",
    name: "Gemma 3 27B",
    author: "Google / bartowski",
    repo: "bartowski/google_gemma-3-27b-it-GGUF",
    file: "google_gemma-3-27b-it-Q4_K_M.gguf",
    description:
      "Google's flagship open model. Excellent quality across all tasks, fits tight on 4090.",
    params: "27B",
    sizeLabel: "17 GB",
    sizeMb: 17000,
    context: "128K",
    quantization: "Q4_K_M",
    category: ["xl", "multilingual", "reasoning"],
    likes: 4500,
    vramEstimate: "~18.5 GB",
  },
  // Qwen 3.5: requires Node.js engine or a future llama-cpp-python release
  {
    id: "qwen35-9b",
    name: "Qwen 3.5 9B",
    author: "Qwen / unsloth",
    repo: "unsloth/Qwen3.5-9B-GGUF",
    file: "Qwen3.5-9B-Q4_K_M.gguf",
    description:
      "Latest Qwen 3.5 generation. Enhanced reasoning and instruction following. Use Node.js engine for best compatibility.",
    params: "9B",
    sizeLabel: "5.4 GB",
    sizeMb: 5400,
    context: "128K",
    quantization: "Q4_K_M",
    category: ["medium", "reasoning"],
    featured: true,
    likes: 4300,
    vramEstimate: "~6.0 GB",
  },
];

/* ------------------------------------------------------------------ */
/*  Category definitions                                              */
/* ------------------------------------------------------------------ */
const CATEGORIES = [
  { key: "all", label: "All Models", icon: <RobotOutlined /> },
  { key: "featured", label: "Featured", icon: <StarFilled /> },
  { key: "tiny", label: "Tiny (< 1 GB)", icon: <ThunderboltOutlined /> },
  { key: "small", label: "Small (1–3 GB)", icon: <ThunderboltOutlined /> },
  { key: "medium", label: "Medium (3–8 GB)", icon: <ExperimentOutlined /> },
  { key: "large", label: "Large (8–16 GB)", icon: <FireOutlined /> },
  { key: "xl", label: "XL (16–24 GB)", icon: <FireOutlined /> },
  { key: "coding", label: "Coding", icon: <CodeOutlined /> },
  { key: "reasoning", label: "Reasoning", icon: <ExperimentOutlined /> },
  { key: "multilingual", label: "Multilingual", icon: <GlobalOutlined /> },
  { key: "tool-use", label: "Tool Use", icon: <ToolOutlined /> },
];

const CATEGORY_COLORS: Record<string, string> = {
  tiny: "#52c41a",
  small: "#1677ff",
  medium: "#722ed1",
  large: "#fa8c16",
  xl: "#f5222d",
  coding: "#13c2c2",
  reasoning: "#eb2f96",
  multilingual: "#2f54eb",
  "tool-use": "#faad14",
};

/* ------------------------------------------------------------------ */
/*  HuggingFace search types                                          */
/* ------------------------------------------------------------------ */
interface HFSearchResult {
  id: string;
  modelId: string;
  author: string;
  likes: number;
  downloads: number;
  tags: string[];
  siblings?: { rfilename: string }[];
}

interface HFModelCard {
  id: string;
  name: string;
  author: string;
  repo: string;
  files: string[];
  likes: number;
  downloads: number;
  tags: string[];
}

/* ------------------------------------------------------------------ */
/*  Helper: format bytes                                              */
/* ------------------------------------------------------------------ */
function formatSize(mb: number): string {
  if (mb < 1024) return `${mb} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */
const cardStyles: Record<string, React.CSSProperties> = {
  card: {
    background: "linear-gradient(145deg, #1e1e2e 0%, #1a1a2a 100%)",
    border: "1px solid #2a2a3a",
    borderRadius: 12,
    padding: "16px 18px",
    cursor: "pointer",
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    position: "relative",
    overflow: "hidden",
  },
  cardHover: {
    border: "1px solid #3a3a5a",
    transform: "translateY(-2px)",
    boxShadow: "0 8px 32px rgba(22, 119, 255, 0.12)",
  },
  featuredBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    background: "linear-gradient(135deg, #ff6b35, #f7931a)",
    color: "#fff",
    fontSize: 10,
    fontWeight: 700,
    padding: "2px 10px 2px 12px",
    borderRadius: "0 12px 0 12px",
    letterSpacing: "0.5px",
    textTransform: "uppercase" as const,
  },
  sizeIndicator: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */
export default function DiscoverPanel() {
  const { models: downloadedModels } = useServerStore();

  // Download state
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<HFModelCard[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Category filter
  const [activeCategory, setActiveCategory] = useState("featured");

  // Hover states
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  // Expanded model detail
  const [selectedModel, setSelectedModel] = useState<CatalogModel | null>(null);

  // ─── loadModels callback ────────────────────────────────────────
  const { setModels } = useServerStore();
  const loadModels = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/plugins/${PLUGIN_ID}/models`);
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
      }
    } catch {
      /* ignore */
    }
  }, [setModels]);

  // ─── Search HuggingFace ────────────────────────────────────────
  const searchHuggingFace = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const url = `https://huggingface.co/api/models?search=${encodeURIComponent(query + " gguf")}&limit=12&sort=likes&direction=-1&filter=gguf`;
      const res = await fetch(url);
      if (res.ok) {
        const data: HFSearchResult[] = await res.json();
        const cards: HFModelCard[] = data.map((m) => {
          const ggufFiles = (m.siblings || [])
            .map((s) => s.rfilename)
            .filter((f) => f.endsWith(".gguf"));
          return {
            id: m.id || m.modelId,
            name: (m.id || m.modelId).split("/").pop() || m.id || m.modelId,
            author: m.author || (m.id || m.modelId).split("/")[0],
            repo: m.id || m.modelId,
            files: ggufFiles,
            likes: m.likes || 0,
            downloads: m.downloads || 0,
            tags: m.tags || [],
          };
        });
        setSearchResults(cards);
      }
    } catch {
      message.error("Failed to search HuggingFace");
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    if (searchQuery.trim()) {
      searchTimeoutRef.current = setTimeout(() => {
        searchHuggingFace(searchQuery);
      }, 500);
    } else {
      setSearchResults([]);
    }
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, searchHuggingFace]);

  // ─── Download ──────────────────────────────────────────────────
  const downloadModel = async (repo: string, file: string, modelId: string) => {
    if (downloading) return;
    setDownloading(modelId);
    setDownloadProgress(0);

    try {
      const res = await fetch(
        `${API_BASE}/api/v1/plugins/${PLUGIN_ID}/download-model`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repo, file }),
        },
      );

      if (!res.ok) throw new Error(`Server error: ${await res.text()}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.event === "progress") {
              setDownloadProgress(evt.percent);
            } else if (evt.event === "done") {
              message.success(`Downloaded ${evt.file}`);
              loadModels();
            } else if (evt.event === "error") {
              message.error(evt.message);
            }
          } catch {
            /* skip */
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Download failed";
      message.error(msg);
    } finally {
      setDownloading(null);
      setDownloadProgress(0);
    }
  };

  // ─── Filter catalog ────────────────────────────────────────────
  const filteredCatalog = CATALOG.filter((m) => {
    if (activeCategory === "all") return true;
    if (activeCategory === "featured") return m.featured;
    return m.category.includes(activeCategory);
  });

  const isModelDownloaded = (file: string) =>
    downloadedModels.some((dm) => dm.file === file);

  // ─── Get VRAM color indicator ──────────────────────────────────
  const getVramColor = (sizeMb: number) => {
    if (sizeMb < 1500) return "#52c41a"; // green
    if (sizeMb < 5000) return "#1677ff"; // blue
    if (sizeMb < 10000) return "#fa8c16"; // orange
    return "#f5222d"; // red
  };

  // ─── Render catalog model card ─────────────────────────────────
  const renderCatalogCard = (model: CatalogModel) => {
    const isDownloaded = isModelDownloaded(model.file);
    const isDownloading = downloading === model.id;
    const isHovered = hoveredCard === model.id;
    const isSelected = selectedModel?.id === model.id;

    return (
      <div
        key={model.id}
        style={{
          ...cardStyles.card,
          ...(isHovered || isSelected ? cardStyles.cardHover : {}),
          ...(isSelected ? { borderColor: "#1677ff" } : {}),
        }}
        onMouseEnter={() => setHoveredCard(model.id)}
        onMouseLeave={() => setHoveredCard(null)}
        onClick={() => setSelectedModel(isSelected ? null : model)}
      >
        {model.featured && (
          <div style={cardStyles.featuredBadge}>
            <StarFilled style={{ fontSize: 8, marginRight: 3 }} />
            Featured
          </div>
        )}

        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 8,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 2,
              }}
            >
              <Text
                strong
                style={{ color: "#e8e8f0", fontSize: 14, lineHeight: "20px" }}
              >
                {model.name}
              </Text>
              {isDownloaded && (
                <CheckCircleFilled style={{ color: "#52c41a", fontSize: 14 }} />
              )}
            </div>
            <Text style={{ color: "#666680", fontSize: 11 }}>
              {model.author}
            </Text>
          </div>
          <div
            style={{
              ...cardStyles.sizeIndicator,
              background: `${getVramColor(model.sizeMb)}15`,
              color: getVramColor(model.sizeMb),
            }}
          >
            <ThunderboltOutlined style={{ fontSize: 10 }} />
            {model.vramEstimate}
          </div>
        </div>

        {/* Description */}
        <Text
          style={{
            color: "#9999aa",
            fontSize: 12,
            display: "block",
            marginBottom: 10,
            lineHeight: "18px",
          }}
        >
          {model.description}
        </Text>

        {/* Tags */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            marginBottom: 10,
          }}
        >
          <Tag
            style={{
              background: "#1a1a2e",
              border: "1px solid #2a2a4a",
              color: "#8888aa",
              fontSize: 11,
              borderRadius: 4,
              margin: 0,
              padding: "0 6px",
              lineHeight: "20px",
            }}
          >
            {model.params} params
          </Tag>
          <Tag
            style={{
              background: "#1a1a2e",
              border: "1px solid #2a2a4a",
              color: "#8888aa",
              fontSize: 11,
              borderRadius: 4,
              margin: 0,
              padding: "0 6px",
              lineHeight: "20px",
            }}
          >
            {model.context} ctx
          </Tag>
          <Tag
            style={{
              background: "#1a1a2e",
              border: "1px solid #2a2a4a",
              color: "#8888aa",
              fontSize: 11,
              borderRadius: 4,
              margin: 0,
              padding: "0 6px",
              lineHeight: "20px",
            }}
          >
            {model.quantization}
          </Tag>
          {model.category
            .filter(
              (c) => !["tiny", "small", "medium", "large", "xl"].includes(c),
            )
            .map((cat) => (
              <Tag
                key={cat}
                style={{
                  background: `${CATEGORY_COLORS[cat] || "#1677ff"}15`,
                  border: `1px solid ${CATEGORY_COLORS[cat] || "#1677ff"}40`,
                  color: CATEGORY_COLORS[cat] || "#1677ff",
                  fontSize: 11,
                  borderRadius: 4,
                  margin: 0,
                  padding: "0 6px",
                  lineHeight: "20px",
                }}
              >
                {cat}
              </Tag>
            ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {model.likes && (
              <Tooltip title="Likes">
                <span
                  style={{
                    color: "#666680",
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                  }}
                >
                  <StarFilled style={{ fontSize: 10, color: "#faad14" }} />
                  {formatNumber(model.likes)}
                </span>
              </Tooltip>
            )}
            <span style={{ color: "#666680", fontSize: 11 }}>
              {model.sizeLabel}
            </span>
          </div>

          {isDownloaded ? (
            <Tag
              color="success"
              style={{ margin: 0, borderRadius: 6, fontSize: 11 }}
            >
              <CheckCircleFilled /> Downloaded
            </Tag>
          ) : isDownloading ? (
            <div style={{ width: 120 }}>
              <Progress
                percent={downloadProgress}
                size="small"
                status="active"
                strokeColor={{
                  "0%": "#1677ff",
                  "100%": "#52c41a",
                }}
                style={{ margin: 0 }}
              />
            </div>
          ) : (
            <div
              onClick={(e) => {
                e.stopPropagation();
                downloadModel(model.repo, model.file, model.id);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 12px",
                borderRadius: 6,
                background: isHovered
                  ? "linear-gradient(135deg, #1677ff, #4096ff)"
                  : "#1677ff20",
                color: isHovered ? "#fff" : "#1677ff",
                fontSize: 12,
                fontWeight: 500,
                cursor: downloading ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
                opacity: downloading ? 0.5 : 1,
              }}
            >
              <CloudDownloadOutlined style={{ fontSize: 13 }} />
              Download
            </div>
          )}
        </div>

        {/* Expanded detail */}
        {isSelected && (
          <div
            style={{
              marginTop: 12,
              padding: "12px 0 0",
              borderTop: "1px solid #2a2a3a",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px 16px",
              }}
            >
              <div>
                <Text
                  style={{
                    color: "#666680",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Repository
                </Text>
                <br />
                <Text copyable style={{ color: "#aaaacc", fontSize: 12 }}>
                  {model.repo}
                </Text>
              </div>
              <div>
                <Text
                  style={{
                    color: "#666680",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  File
                </Text>
                <br />
                <Text copyable style={{ color: "#aaaacc", fontSize: 12 }}>
                  {model.file}
                </Text>
              </div>
              <div>
                <Text
                  style={{
                    color: "#666680",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Parameters
                </Text>
                <br />
                <Text style={{ color: "#aaaacc", fontSize: 12 }}>
                  {model.params}
                </Text>
              </div>
              <div>
                <Text
                  style={{
                    color: "#666680",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Context Window
                </Text>
                <br />
                <Text style={{ color: "#aaaacc", fontSize: 12 }}>
                  {model.context}
                </Text>
              </div>
              <div>
                <Text
                  style={{
                    color: "#666680",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  VRAM Required
                </Text>
                <br />
                <Text
                  style={{ color: getVramColor(model.sizeMb), fontSize: 12 }}
                >
                  {model.vramEstimate}
                </Text>
              </div>
              <div>
                <Text
                  style={{
                    color: "#666680",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Download Size
                </Text>
                <br />
                <Text style={{ color: "#aaaacc", fontSize: 12 }}>
                  {model.sizeLabel}
                </Text>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Render HF search result card ──────────────────────────────
  const [expandedHfModel, setExpandedHfModel] = useState<string | null>(null);

  const renderHFCard = (model: HFModelCard) => {
    const isHovered = hoveredCard === `hf-${model.id}`;
    const isExpanded = expandedHfModel === model.id;
    const q4Files = model.files.filter(
      (f) =>
        f.toLowerCase().includes("q4_k_m") ||
        f.toLowerCase().includes("q4_k_s"),
    );
    const recommendedFile = q4Files[0] || model.files[0];

    return (
      <div
        key={model.id}
        style={{
          ...cardStyles.card,
          ...(isHovered ? cardStyles.cardHover : {}),
        }}
        onMouseEnter={() => setHoveredCard(`hf-${model.id}`)}
        onMouseLeave={() => setHoveredCard(null)}
        onClick={() => setExpandedHfModel(isExpanded ? null : model.id)}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 6,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text
              strong
              style={{ color: "#e8e8f0", fontSize: 13, display: "block" }}
            >
              {model.name}
            </Text>
            <Text style={{ color: "#666680", fontSize: 11 }}>
              {model.author}
            </Text>
          </div>
          <Tag
            style={{
              background: "#13c2c215",
              border: "1px solid #13c2c240",
              color: "#13c2c2",
              fontSize: 10,
              margin: 0,
              borderRadius: 4,
            }}
          >
            HuggingFace
          </Tag>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
          <span
            style={{
              color: "#666680",
              fontSize: 11,
              display: "flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <StarFilled style={{ fontSize: 10, color: "#faad14" }} />
            {formatNumber(model.likes)}
          </span>
          <span
            style={{
              color: "#666680",
              fontSize: 11,
              display: "flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <DownloadOutlined style={{ fontSize: 10 }} />
            {formatNumber(model.downloads)}
          </span>
          <span style={{ color: "#666680", fontSize: 11 }}>
            {model.files.length} GGUF files
          </span>
        </div>

        {/* Expanded: file list */}
        {isExpanded && model.files.length > 0 && (
          <div
            style={{
              marginTop: 8,
              borderTop: "1px solid #2a2a3a",
              paddingTop: 8,
            }}
          >
            <Text
              style={{
                color: "#8888aa",
                fontSize: 11,
                marginBottom: 6,
                display: "block",
              }}
            >
              Available files:
            </Text>
            <div
              style={{
                maxHeight: 200,
                overflow: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {model.files.map((file) => {
                const isFileDownloaded = isModelDownloaded(file);
                const isFileDownloading =
                  downloading === `hf-${model.id}-${file}`;

                return (
                  <div
                    key={file}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: "#15152a",
                      border: "1px solid #22223a",
                    }}
                  >
                    <Text
                      style={{
                        color: "#aaaacc",
                        fontSize: 11,
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={file}
                    >
                      {file}
                    </Text>
                    {isFileDownloaded ? (
                      <CheckCircleFilled
                        style={{
                          color: "#52c41a",
                          fontSize: 13,
                          marginLeft: 8,
                        }}
                      />
                    ) : isFileDownloading ? (
                      <div style={{ width: 60, marginLeft: 8 }}>
                        <Progress
                          percent={downloadProgress}
                          size="small"
                          status="active"
                        />
                      </div>
                    ) : (
                      <CloudDownloadOutlined
                        style={{
                          color: "#1677ff",
                          fontSize: 14,
                          marginLeft: 8,
                          cursor: downloading ? "not-allowed" : "pointer",
                          opacity: downloading ? 0.4 : 1,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadModel(
                            model.repo,
                            file,
                            `hf-${model.id}-${file}`,
                          );
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick download for recommended file */}
        {!isExpanded && recommendedFile && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            {isModelDownloaded(recommendedFile) ? (
              <Tag
                color="success"
                style={{ margin: 0, borderRadius: 6, fontSize: 11 }}
              >
                <CheckCircleFilled /> Downloaded
              </Tag>
            ) : (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  downloadModel(
                    model.repo,
                    recommendedFile,
                    `hf-${model.id}-${recommendedFile}`,
                  );
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: isHovered
                    ? "linear-gradient(135deg, #1677ff, #4096ff)"
                    : "#1677ff20",
                  color: isHovered ? "#fff" : "#1677ff",
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: downloading ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease",
                  opacity: downloading ? 0.5 : 1,
                }}
              >
                <CloudDownloadOutlined style={{ fontSize: 12 }} />
                {recommendedFile.length > 30
                  ? recommendedFile.slice(0, 27) + "..."
                  : recommendedFile}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ─── Custom Model HF URL / repo ────────────────────────────────
  const [customInput, setCustomInput] = useState("");
  const [customFiles, setCustomFiles] = useState<string[]>([]);
  const [loadingCustom, setLoadingCustom] = useState(false);

  const fetchCustomModel = async () => {
    if (!customInput.trim()) return;
    setLoadingCustom(true);
    try {
      // Extract repo from URL or plain text
      let repo = customInput.trim();
      const hfUrlMatch = repo.match(/huggingface\.co\/([^/]+\/[^/]+)/);
      if (hfUrlMatch) repo = hfUrlMatch[1];
      // Remove trailing slashes
      repo = repo.replace(/\/+$/, "");

      const res = await fetch(`https://huggingface.co/api/models/${repo}`);
      if (res.ok) {
        const data = await res.json();
        const ggufFiles = (data.siblings || [])
          .map((s: { rfilename: string }) => s.rfilename)
          .filter((f: string) => f.endsWith(".gguf"));
        if (ggufFiles.length === 0) {
          message.warning("No GGUF files found in this repository");
        }
        setCustomFiles(ggufFiles);
      } else {
        message.error("Repository not found");
      }
    } catch {
      message.error("Failed to fetch repository info");
    } finally {
      setLoadingCustom(false);
    }
  };

  /* ─── Main render ──────────────────────────────────────────────── */
  return (
    <div style={{ height: "100%", overflow: "auto", background: "#111118" }}>
      {/* Hero / Search */}
      <div
        style={{
          padding: "24px 20px 20px",
          background: "linear-gradient(180deg, #16162a 0%, #111118 100%)",
          borderBottom: "1px solid #1e1e2e",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 4,
          }}
        >
          <RobotOutlined style={{ fontSize: 22, color: "#1677ff" }} />
          <Title
            level={4}
            style={{ color: "#e8e8f0", margin: 0, fontWeight: 600 }}
          >
            Discover Models
          </Title>
        </div>
        <Text
          style={{
            color: "#666680",
            fontSize: 12,
            display: "block",
            marginBottom: 16,
          }}
        >
          Browse curated models optimized for consumer GPUs (≤ 24 GB VRAM) or
          search HuggingFace
        </Text>

        <Input
          prefix={<SearchOutlined style={{ color: "#555570" }} />}
          suffix={isSearching ? <Spin size="small" /> : null}
          placeholder="Search HuggingFace models, or paste a repo URL..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onPressEnter={() => {
            // Check if it looks like a repo URL / owner/repo
            if (customInput !== searchQuery) {
              setCustomInput(searchQuery);
            }
          }}
          style={{
            background: "#1a1a2a",
            border: "1px solid #2a2a4a",
            borderRadius: 10,
            height: 40,
            color: "#e8e8f0",
            fontSize: 13,
          }}
          allowClear
        />
      </div>

      {/* Search Results */}
      {searchQuery.trim() && (
        <div style={{ padding: "16px 20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <EyeOutlined style={{ color: "#13c2c2", fontSize: 14 }} />
            <Text style={{ color: "#aaaacc", fontSize: 13, fontWeight: 500 }}>
              Search Results
            </Text>
            {searchResults.length > 0 && (
              <Tag
                style={{
                  background: "#13c2c215",
                  border: "none",
                  color: "#13c2c2",
                  fontSize: 11,
                  margin: 0,
                }}
              >
                {searchResults.length} found
              </Tag>
            )}
          </div>
          {isSearching ? (
            <div style={{ textAlign: "center", padding: 40 }}>
              <Spin size="large" />
              <br />
              <Text style={{ color: "#666680", fontSize: 12, marginTop: 8 }}>
                Searching HuggingFace...
              </Text>
            </div>
          ) : searchResults.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: 12,
              }}
            >
              {searchResults.map(renderHFCard)}
            </div>
          ) : searchQuery.trim() && !isSearching ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <Text style={{ color: "#666680" }}>No GGUF models found</Text>
              }
              style={{ padding: 24 }}
            />
          ) : null}

          <div
            style={{
              margin: "16px 0",
              height: 1,
              background:
                "linear-gradient(90deg, transparent, #2a2a4a, transparent)",
            }}
          />
        </div>
      )}

      {/* Category Tabs */}
      <div style={{ padding: "12px 20px 0" }}>
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            paddingBottom: 12,
            scrollbarWidth: "none",
          }}
        >
          {CATEGORIES.map((cat) => (
            <div
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: activeCategory === cat.key ? 600 : 400,
                color: activeCategory === cat.key ? "#e8e8f0" : "#666680",
                background:
                  activeCategory === cat.key
                    ? "linear-gradient(135deg, #1677ff30, #722ed130)"
                    : "#1a1a2a",
                border:
                  activeCategory === cat.key
                    ? "1px solid #1677ff50"
                    : "1px solid #22223a",
                cursor: "pointer",
                transition: "all 0.2s ease",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {cat.icon}
              {cat.label}
            </div>
          ))}
        </div>
      </div>

      {/* Catalog Grid */}
      <div style={{ padding: "8px 20px 20px" }}>
        {filteredCatalog.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 12,
            }}
          >
            {filteredCatalog.map(renderCatalogCard)}
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Text style={{ color: "#666680" }}>
                No models in this category
              </Text>
            }
            style={{ padding: 40 }}
          />
        )}
      </div>

      {/* Custom Model Download Section */}
      <div
        style={{
          padding: "16px 20px 24px",
          borderTop: "1px solid #1e1e2e",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <ApiOutlined style={{ color: "#722ed1", fontSize: 14 }} />
          <Text style={{ color: "#aaaacc", fontSize: 13, fontWeight: 500 }}>
            Custom Repository
          </Text>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Input
            placeholder="Paste HuggingFace URL or owner/repo..."
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onPressEnter={fetchCustomModel}
            style={{
              background: "#1a1a2a",
              border: "1px solid #2a2a4a",
              borderRadius: 8,
              color: "#e8e8f0",
              fontSize: 12,
              flex: 1,
            }}
          />
          <div
            onClick={fetchCustomModel}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "6px 16px",
              borderRadius: 8,
              background: customInput.trim()
                ? "linear-gradient(135deg, #722ed1, #9254de)"
                : "#2a2a3a",
              color: customInput.trim() ? "#fff" : "#666680",
              fontSize: 12,
              fontWeight: 500,
              cursor: customInput.trim() ? "pointer" : "not-allowed",
              transition: "all 0.2s ease",
              whiteSpace: "nowrap",
            }}
          >
            {loadingCustom ? <Spin size="small" /> : <SearchOutlined />}
            Fetch Files
          </div>
        </div>

        {customFiles.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Text
              style={{
                color: "#8888aa",
                fontSize: 11,
                display: "block",
                marginBottom: 8,
              }}
            >
              {customFiles.length} GGUF files found:
            </Text>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                maxHeight: 200,
                overflow: "auto",
              }}
            >
              {customFiles.map((file) => {
                const isFileDownloaded = isModelDownloaded(file);
                const repo = customInput
                  .replace(/https?:\/\/huggingface\.co\//, "")
                  .replace(/\/+$/, "");
                const isFileDownloading = downloading === `custom-${file}`;

                return (
                  <div
                    key={file}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: "#15152a",
                      border: "1px solid #22223a",
                    }}
                  >
                    <Text
                      style={{
                        color: "#aaaacc",
                        fontSize: 12,
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={file}
                    >
                      {file}
                    </Text>
                    {isFileDownloaded ? (
                      <Tag
                        color="success"
                        style={{
                          margin: 0,
                          marginLeft: 8,
                          borderRadius: 6,
                          fontSize: 10,
                        }}
                      >
                        <CheckCircleFilled /> Downloaded
                      </Tag>
                    ) : isFileDownloading ? (
                      <div style={{ width: 80, marginLeft: 8 }}>
                        <Progress
                          percent={downloadProgress}
                          size="small"
                          status="active"
                        />
                      </div>
                    ) : (
                      <div
                        onClick={() =>
                          downloadModel(repo, file, `custom-${file}`)
                        }
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "3px 10px",
                          borderRadius: 6,
                          background: "#1677ff20",
                          color: "#1677ff",
                          fontSize: 11,
                          cursor: downloading ? "not-allowed" : "pointer",
                          opacity: downloading ? 0.5 : 1,
                          marginLeft: 8,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <CloudDownloadOutlined style={{ fontSize: 11 }} />
                        Download
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
