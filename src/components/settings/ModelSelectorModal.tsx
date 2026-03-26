import { useState, useEffect, useMemo } from 'react';
import { X, Search, Sparkles, Clock, DollarSign, Info, Eye } from 'lucide-react';
import { OpenRouterModel } from '../../types';

interface ModelSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (modelId: string) => void;
  models: OpenRouterModel[];
  currentModel: string;
  showVisionOnly?: boolean;
}

export default function ModelSelectorModal({
  isOpen,
  onClose,
  onSelect,
  models,
  currentModel,
  showVisionOnly = true
}: ModelSelectorModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [selectedModelId, setSelectedModelId] = useState(currentModel);
  const [visionOnlyFilter, setVisionOnlyFilter] = useState(showVisionOnly);

  useEffect(() => {
    setSelectedModelId(currentModel);
  }, [currentModel]);

  // Extract unique providers
  const providers = useMemo(() => {
    const uniqueProviders = Array.from(new Set(models.map(m => m.provider)));
    return uniqueProviders.sort();
  }, [models]);

  // Vision keywords for filtering
  const isVisionModel = (model: OpenRouterModel): boolean => {
    const visionKeywords = ['vl', 'vision', 'gemini', 'gpt-4o', 'claude-3', 'pixtral', 'llava', 'qwen2-vl', 'qwen3-vl'];
    const idLower = model.id.toLowerCase();
    const nameLower = model.name.toLowerCase();
    const descLower = model.description.toLowerCase();

    return visionKeywords.some(keyword =>
      idLower.includes(keyword) ||
      nameLower.includes(keyword) ||
      descLower.includes('vision') ||
      descLower.includes('image') ||
      descLower.includes('multimodal')
    );
  };

  // Filter models based on search, provider, and vision filter
  const filteredModels = useMemo(() => {
    return models.filter(model => {
      const matchesSearch =
        model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        model.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        model.description.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesProvider = providerFilter === 'all' || model.provider === providerFilter;
      const matchesVision = !visionOnlyFilter || isVisionModel(model);

      return matchesSearch && matchesProvider && matchesVision;
    });
  }, [models, searchTerm, providerFilter, visionOnlyFilter]);

  const handleSelect = () => {
    onSelect(selectedModelId);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] animate-in fade-in duration-200">
      <div className="bg-zinc-900 rounded-xl shadow-2xl max-w-4xl w-full mx-4 border border-zinc-800 max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold text-white">Select AI Model</h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search and Filter */}
        <div className="p-4 border-b border-zinc-800 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search models by name, provider, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
            />
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm text-zinc-400">Provider:</label>
              <select
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                className="px-3 py-1 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
              >
                <option value="all">All Providers ({models.length})</option>
                {providers.map(provider => (
                  <option key={provider} value={provider}>
                    {provider.charAt(0).toUpperCase() + provider.slice(1)} (
                    {models.filter(m => m.provider === provider).length})
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={visionOnlyFilter}
                onChange={(e) => setVisionOnlyFilter(e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-950 text-amber-500 focus:ring-amber-500"
              />
              <Eye size={14} />
              Vision models only
            </label>
          </div>

          {filteredModels.length > 0 && (
            <p className="text-xs text-zinc-500">
              Showing {filteredModels.length} model{filteredModels.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Model List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredModels.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-zinc-500">No models found matching your criteria</p>
            </div>
          ) : (
            filteredModels.map(model => (
              <div
                key={model.id}
                onClick={() => setSelectedModelId(model.id)}
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedModelId === model.id
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-zinc-100 truncate">{model.name}</h4>
                      <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-xs rounded">
                        {model.provider}
                      </span>
                      {isVisionModel(model) && (
                        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded flex items-center gap-1">
                          <Eye size={10} /> Vision
                        </span>
                      )}
                    </div>

                    {model.description && (
                      <p className="text-xs text-zinc-500 mb-2 line-clamp-2">
                        {model.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-zinc-500">
                      <div className="flex items-center gap-1" title="Context Window">
                        <Clock className="w-3 h-3" />
                        <span>{(model.context_length / 1000).toFixed(0)}K tokens</span>
                      </div>

                      <div className="flex items-center gap-1" title="Pricing (Input / Output per 1M tokens)">
                        <DollarSign className="w-3 h-3" />
                        <span>
                          ${model.prompt_price_per_1m.toFixed(2)} / ${model.completion_price_per_1m.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {selectedModelId === model.id && (
                    <div className="flex-shrink-0">
                      <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center">
                        <svg className="w-4 h-4 text-zinc-950" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800">
          <div className="flex items-start gap-2 mb-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-200">
              <strong>Pricing:</strong> Shown as Input/Output per 1M tokens.
              Actual costs vary by usage. Lower prices = more cost-effective.
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSelect}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium rounded-lg transition-colors"
            >
              Select Model
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
