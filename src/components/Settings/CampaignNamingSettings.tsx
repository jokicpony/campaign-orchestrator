'use client';

import React, { useState } from 'react';
import { GlobalPromptSettings, NamingConventionTemplate, NamingToken, DEFAULT_CAMPAIGN_NAMING_TEMPLATE, DEFAULT_CAMPAIGN_TYPES } from '@/types';
import { X, Plus, GripVertical, Trash2, ChevronDown, ChevronUp, Pencil } from 'lucide-react';

interface CampaignNamingSettingsProps {
    settings: GlobalPromptSettings;
    onChange: (updates: Partial<GlobalPromptSettings>) => void;
}

const TOKEN_TYPES = [
    { value: 'dropdown', label: 'Dropdown', description: 'Select from predefined options' },
    { value: 'text', label: 'Free Text', description: 'User enters any text' },
    { value: 'auto', label: 'Auto', description: 'Pulled from campaign data' },
] as const;

const AUTO_SOURCES = [
    { value: 'date', label: 'Date (MM.DD.YYYY)' },
    { value: 'campaignType', label: 'Campaign Type' },
] as const;

const SEPARATORS = [
    { value: '_', label: 'Underscore (_)' },
    { value: '-', label: 'Dash (-)' },
    { value: '.', label: 'Dot (.)' },
    { value: ' ', label: 'Space' },
] as const;

export function CampaignNamingSettings({ settings, onChange }: CampaignNamingSettingsProps) {
    const templates = settings.campaignNamingTemplates || [];
    const campaignTypes = settings.campaignTypes || DEFAULT_CAMPAIGN_TYPES;
    const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(
        templates.length > 0 ? templates[0].id : null
    );
    const [newOptionValue, setNewOptionValue] = useState<Record<string, string>>({});
    const [showAliasEditor, setShowAliasEditor] = useState(false);

    // Drag-and-drop state for token reordering
    const [dragToken, setDragToken] = useState<{ templateId: string; tokenIndex: number } | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const handleMoveToken = (templateId: string, fromIndex: number, toIndex: number) => {
        if (fromIndex === toIndex) return;
        const template = templates.find(t => t.id === templateId);
        if (!template) return;
        const tokens = [...template.tokens];
        const [moved] = tokens.splice(fromIndex, 1);
        tokens.splice(toIndex, 0, moved);
        handleUpdateTemplate(templateId, { tokens });
    };

    const ensureTemplates = (tmpl: NamingConventionTemplate[]): NamingConventionTemplate[] => {
        if (tmpl.length === 0) {
            return [{ ...DEFAULT_CAMPAIGN_NAMING_TEMPLATE, id: crypto.randomUUID() }];
        }
        return tmpl;
    };

    const handleAddTemplate = () => {
        const newTemplate: NamingConventionTemplate = {
            id: crypto.randomUUID(),
            name: `Campaign Template ${templates.length + 1}`,
            separator: '_',
            tokens: [
                { id: crypto.randomUUID(), label: 'Product', key: 'product', type: 'dropdown', options: [], required: true },
            ],
        };
        const updated = [...templates, newTemplate];
        onChange({ campaignNamingTemplates: updated });
        setExpandedTemplateId(newTemplate.id);
    };

    const handleDeleteTemplate = (templateId: string) => {
        const updated = templates.filter(t => t.id !== templateId);
        onChange({ campaignNamingTemplates: ensureTemplates(updated) });
        if (settings.defaultCampaignNamingTemplateId === templateId) {
            onChange({ defaultCampaignNamingTemplateId: undefined });
        }
    };

    const handleUpdateTemplate = (templateId: string, updates: Partial<NamingConventionTemplate>) => {
        const updated = templates.map(t =>
            t.id === templateId ? { ...t, ...updates } : t
        );
        onChange({ campaignNamingTemplates: updated });
    };

    const handleAddToken = (templateId: string) => {
        const template = templates.find(t => t.id === templateId);
        if (!template) return;
        const newToken: NamingToken = {
            id: crypto.randomUUID(),
            label: 'New Token',
            key: `token_${template.tokens.length + 1}`,
            type: 'text',
            required: false,
        };
        handleUpdateTemplate(templateId, { tokens: [...template.tokens, newToken] });
    };

    const handleDeleteToken = (templateId: string, tokenId: string) => {
        const template = templates.find(t => t.id === templateId);
        if (!template) return;
        handleUpdateTemplate(templateId, {
            tokens: template.tokens.filter(tok => tok.id !== tokenId)
        });
    };

    const handleUpdateToken = (templateId: string, tokenId: string, updates: Partial<NamingToken>) => {
        const template = templates.find(t => t.id === templateId);
        if (!template) return;
        handleUpdateTemplate(templateId, {
            tokens: template.tokens.map(tok =>
                tok.id === tokenId ? { ...tok, ...updates } : tok
            )
        });
    };

    const handleAddOption = (templateId: string, tokenId: string) => {
        const key = `${templateId}-${tokenId}`;
        const value = newOptionValue[key]?.trim();
        if (!value) return;

        const template = templates.find(t => t.id === templateId);
        const token = template?.tokens.find(tok => tok.id === tokenId);
        if (!token) return;

        const currentOptions = token.options || [];
        if (!currentOptions.includes(value)) {
            handleUpdateToken(templateId, tokenId, {
                options: [...currentOptions, value]
            });
        }
        setNewOptionValue(prev => ({ ...prev, [key]: '' }));
    };

    const handleRemoveOption = (templateId: string, tokenId: string, option: string) => {
        const template = templates.find(t => t.id === templateId);
        const token = template?.tokens.find(tok => tok.id === tokenId);
        if (!token?.options) return;

        handleUpdateToken(templateId, tokenId, {
            options: token.options.filter(o => o !== option)
        });
    };

    const handleUpdateCampaignTypeAlias = (typeId: string, newAlias: string) => {
        const updated = campaignTypes.map(ct =>
            ct.id === typeId ? { ...ct, namingAlias: newAlias } : ct
        );
        onChange({ campaignTypes: updated });
    };

    // Generate preview for a template
    const generatePreview = (template: NamingConventionTemplate): string => {
        const parts = template.tokens.map(tok => {
            if (tok.type === 'auto') {
                if (tok.autoSource === 'date') {
                    const d = new Date();
                    return `${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getDate().toString().padStart(2, '0')}.${d.getFullYear()}`;
                } else if (tok.autoSource === 'campaignType') {
                    return campaignTypes[0]?.namingAlias || 'STD';
                }
                return `[${tok.autoSource || tok.label}]`;
            } else if (tok.type === 'dropdown' && tok.options && tok.options.length > 0) {
                return tok.options[0];
            } else {
                return `{${tok.label}}`;
            }
        });
        return parts.join(template.separator);
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-foreground mb-1">Campaign Naming Conventions</h3>
                <p className="text-sm text-foreground-muted">
                    Create templates for structured campaign names used during publishing
                </p>
            </div>

            {/* Campaign Type Aliases */}
            <div className="p-3 rounded-lg bg-background-tertiary/50 border border-border">
                <button
                    onClick={() => setShowAliasEditor(!showAliasEditor)}
                    className="w-full flex items-center justify-between text-left"
                >
                    <div className="flex items-center gap-2">
                        <Pencil className="w-3.5 h-3.5 text-foreground-muted" />
                        <span className="text-xs font-medium text-foreground-muted uppercase tracking-wide">Campaign Type Aliases</span>
                    </div>
                    {showAliasEditor ? (
                        <ChevronUp className="w-3.5 h-3.5 text-foreground-subtle" />
                    ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-foreground-subtle" />
                    )}
                </button>
                {showAliasEditor && (
                    <div className="mt-3 space-y-2">
                        <p className="text-xs text-foreground-muted mb-2">
                            Configure the shorthand used in generated campaign names for each campaign type
                        </p>
                        {campaignTypes.map(ct => (
                            <div key={ct.id} className="flex items-center gap-3">
                                <span className="text-xs text-foreground-muted w-40 truncate">{ct.displayName}</span>
                                <span className="text-xs text-foreground-subtle">→</span>
                                <input
                                    type="text"
                                    value={ct.namingAlias}
                                    onChange={(e) => handleUpdateCampaignTypeAlias(ct.id, e.target.value)}
                                    className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-accent-primary font-mono"
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Templates List */}
            <div className="space-y-3">
                {templates.map(template => (
                    <div
                        key={template.id}
                        className="bg-background-tertiary border border-border rounded-lg overflow-hidden"
                    >
                        {/* Template Header */}
                        <div
                            className="flex items-center gap-3 p-3 cursor-pointer hover:bg-background-secondary transition-colors"
                            onClick={() => setExpandedTemplateId(
                                expandedTemplateId === template.id ? null : template.id
                            )}
                        >
                            <GripVertical className="w-4 h-4 text-foreground-subtle" />
                            <div className="flex-1">
                                <input
                                    type="text"
                                    value={template.name}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        handleUpdateTemplate(template.id, { name: e.target.value });
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="bg-transparent border-none text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-accent-primary rounded px-1 -ml-1"
                                />
                                <p className="text-xs text-foreground-subtle font-mono mt-0.5">
                                    {generatePreview(template)}
                                </p>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChange({ defaultCampaignNamingTemplateId: template.id });
                                }}
                                className={`px-2 py-1 text-xs rounded-full transition-colors ${settings.defaultCampaignNamingTemplateId === template.id
                                    ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary'
                                    : 'bg-background text-foreground-muted border border-border hover:border-accent-primary'
                                    }`}
                            >
                                {settings.defaultCampaignNamingTemplateId === template.id ? 'Default' : 'Set Default'}
                            </button>
                            {templates.length > 1 && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteTemplate(template.id);
                                    }}
                                    className="p-1.5 rounded text-foreground-muted hover:text-accent-error hover:bg-accent-error/10 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                            {expandedTemplateId === template.id ? (
                                <ChevronUp className="w-4 h-4 text-foreground-subtle" />
                            ) : (
                                <ChevronDown className="w-4 h-4 text-foreground-subtle" />
                            )}
                        </div>

                        {/* Template Detail (Expanded) */}
                        {expandedTemplateId === template.id && (
                            <div className="border-t border-border p-4 space-y-4">
                                {/* Separator */}
                                <div>
                                    <label className="text-xs font-medium text-foreground-subtle uppercase tracking-wide mb-1 block">
                                        Separator
                                    </label>
                                    <select
                                        value={template.separator}
                                        onChange={(e) => handleUpdateTemplate(template.id, { separator: e.target.value })}
                                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent-primary"
                                    >
                                        {SEPARATORS.map(sep => (
                                            <option key={sep.value} value={sep.value}>{sep.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Tokens */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-xs font-medium text-foreground-subtle uppercase tracking-wide">
                                            Tokens
                                        </label>
                                        <button
                                            onClick={() => handleAddToken(template.id)}
                                            className="flex items-center gap-1 px-2 py-1 text-xs text-accent-primary hover:bg-accent-primary/10 rounded transition-colors"
                                        >
                                            <Plus className="w-3 h-3" /> Add Token
                                        </button>
                                    </div>

                                    <div className="space-y-3">
                                        {template.tokens.map((token, idx) => (
                                            <div
                                                key={token.id}
                                                draggable
                                                onDragStart={(e) => {
                                                    setDragToken({ templateId: template.id, tokenIndex: idx });
                                                    e.dataTransfer.effectAllowed = 'move';
                                                    if (e.currentTarget instanceof HTMLElement) {
                                                        e.currentTarget.style.opacity = '0.5';
                                                    }
                                                }}
                                                onDragEnd={(e) => {
                                                    if (e.currentTarget instanceof HTMLElement) {
                                                        e.currentTarget.style.opacity = '1';
                                                    }
                                                    setDragToken(null);
                                                    setDragOverIndex(null);
                                                }}
                                                onDragOver={(e) => {
                                                    e.preventDefault();
                                                    e.dataTransfer.dropEffect = 'move';
                                                    if (dragToken?.templateId === template.id) {
                                                        setDragOverIndex(idx);
                                                    }
                                                }}
                                                onDragLeave={() => {
                                                    setDragOverIndex(null);
                                                }}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    if (dragToken?.templateId === template.id) {
                                                        handleMoveToken(template.id, dragToken.tokenIndex, idx);
                                                    }
                                                    setDragToken(null);
                                                    setDragOverIndex(null);
                                                }}
                                                className={`p-3 bg-background rounded-lg border transition-colors ${dragOverIndex === idx && dragToken?.templateId === template.id
                                                    ? 'border-accent-primary border-2'
                                                    : 'border-border'
                                                    }`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className="flex items-center gap-1 mt-2 cursor-grab active:cursor-grabbing">
                                                        <GripVertical className="w-4 h-4 text-foreground-subtle hover:text-foreground-muted transition-colors" />
                                                        <span className="text-xs text-foreground-subtle font-mono">
                                                            {idx + 1}.
                                                        </span>
                                                    </div>
                                                    <div className="flex-1 space-y-2">
                                                        {/* Token Label & Key */}
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <input
                                                                type="text"
                                                                value={token.label}
                                                                onChange={(e) => handleUpdateToken(template.id, token.id, {
                                                                    label: e.target.value,
                                                                    key: e.target.value.toLowerCase().replace(/\s+/g, '_')
                                                                })}
                                                                placeholder="Label"
                                                                className="px-2 py-1.5 text-sm bg-background-tertiary border border-border rounded focus:outline-none focus:border-accent-primary"
                                                            />
                                                            <select
                                                                value={token.type}
                                                                onChange={(e) => handleUpdateToken(template.id, token.id, {
                                                                    type: e.target.value as NamingToken['type']
                                                                })}
                                                                className="px-2 py-1.5 text-sm bg-background-tertiary border border-border rounded focus:outline-none focus:border-accent-primary"
                                                            >
                                                                {TOKEN_TYPES.map(t => (
                                                                    <option key={t.value} value={t.value}>{t.label}</option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        {/* Auto Source (for auto type) */}
                                                        {token.type === 'auto' && (
                                                            <select
                                                                value={token.autoSource || 'date'}
                                                                onChange={(e) => handleUpdateToken(template.id, token.id, {
                                                                    autoSource: e.target.value as 'date' | 'campaignType'
                                                                })}
                                                                className="w-full px-2 py-1.5 text-sm bg-background-tertiary border border-border rounded focus:outline-none focus:border-accent-primary"
                                                            >
                                                                {AUTO_SOURCES.map(src => (
                                                                    <option key={src.value} value={src.value}>{src.label}</option>
                                                                ))}
                                                            </select>
                                                        )}

                                                        {/* Dropdown Options (for dropdown type) */}
                                                        {token.type === 'dropdown' && (
                                                            <div className="space-y-2">
                                                                <div className="flex gap-2">
                                                                    <input
                                                                        type="text"
                                                                        value={newOptionValue[`${template.id}-${token.id}`] || ''}
                                                                        onChange={(e) => setNewOptionValue(prev => ({
                                                                            ...prev,
                                                                            [`${template.id}-${token.id}`]: e.target.value
                                                                        }))}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter') {
                                                                                handleAddOption(template.id, token.id);
                                                                            }
                                                                        }}
                                                                        placeholder="Add option..."
                                                                        className="flex-1 px-2 py-1 text-xs bg-background-tertiary border border-border rounded focus:outline-none focus:border-accent-primary"
                                                                    />
                                                                    <button
                                                                        onClick={() => handleAddOption(template.id, token.id)}
                                                                        className="px-2 py-1 text-xs bg-accent-primary text-white rounded hover:bg-accent-primary/90"
                                                                    >
                                                                        Add
                                                                    </button>
                                                                </div>
                                                                {token.options && token.options.length > 0 && (
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {token.options.map(opt => (
                                                                            <span
                                                                                key={opt}
                                                                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-background-secondary text-foreground-muted rounded text-xs"
                                                                            >
                                                                                {opt}
                                                                                <button
                                                                                    onClick={() => handleRemoveOption(template.id, token.id, opt)}
                                                                                    className="hover:text-accent-error"
                                                                                >
                                                                                    <X className="w-3 h-3" />
                                                                                </button>
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeleteToken(template.id, token.id)}
                                                        className="p-1 text-foreground-subtle hover:text-accent-error transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Preview */}
                                <div className="p-3 bg-background rounded-lg border border-accent-primary/30">
                                    <span className="text-xs text-foreground-subtle">Preview:</span>
                                    <p className="text-sm font-mono text-foreground mt-1">
                                        {generatePreview(template)}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Add Template Button */}
            <button
                onClick={handleAddTemplate}
                className="w-full py-3 border-2 border-dashed border-border rounded-lg text-sm text-foreground-muted hover:text-foreground hover:border-accent-primary transition-colors flex items-center justify-center gap-2"
            >
                <Plus className="w-4 h-4" />
                Add Template
            </button>
        </div>
    );
}
