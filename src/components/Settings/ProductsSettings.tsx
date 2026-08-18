'use client';

import React, { useState } from 'react';
import { Product } from '@/types';
import { Plus, Edit2, Trash2, Check } from 'lucide-react';

interface ProductsSettingsProps {
    products: Product[];
    onChange: (products: Product[]) => void;
}

const CHAR_LIMITS = {
    name: 100,
    usps: 500,
};

export function ProductsSettings({ products, onChange }: ProductsSettingsProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newProduct, setNewProduct] = useState<Partial<Product> | null>(null);

    const handleAdd = () => {
        setNewProduct({
            name: '',
            emoji: '📦',
            usps: '',
        });
        setEditingId(null);
    };

    const handleSaveNew = () => {
        if (newProduct?.name?.trim()) {
            const product: Product = {
                id: `prod-${Date.now()}`,
                name: newProduct.name.trim(),
                emoji: newProduct.emoji || '📦',
                usps: newProduct.usps || '',
                createdAt: new Date(),
            };
            onChange([...products, product]);
            setNewProduct(null);
        }
    };

    const handleUpdate = (id: string, updates: Partial<Product>) => {
        onChange(products.map(p => p.id === id ? { ...p, ...updates } : p));
    };

    const handleDelete = (id: string) => {
        onChange(products.filter(p => p.id !== id));
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">Products</h3>
                    <p className="text-sm text-foreground-muted">
                        Your product catalog with USPs for AI copy generation
                    </p>
                </div>
                <button
                    onClick={handleAdd}
                    className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg text-sm font-medium hover:bg-accent-primary/90 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Add Product
                </button>
            </div>

            <div className="space-y-4">
                {/* New Product Form */}
                {newProduct && (
                    <div className="p-4 bg-accent-primary/5 border border-accent-primary/30 rounded-xl space-y-4">
                        <div className="flex items-center gap-3">
                            <input
                                type="text"
                                value={newProduct.emoji || ''}
                                onChange={(e) => setNewProduct({ ...newProduct, emoji: e.target.value })}
                                className="w-12 h-12 text-center text-2xl bg-background-tertiary border border-border rounded-lg focus:outline-none focus:border-accent-primary"
                                placeholder="📦"
                            />
                            <input
                                type="text"
                                value={newProduct.name || ''}
                                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                                placeholder="Product Name"
                                className="flex-1 px-4 py-2 bg-background-tertiary border border-border rounded-lg text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-accent-primary"
                                autoFocus
                            />
                        </div>
                        <div className="space-y-1">
                            <div className="flex justify-between">
                                <label className="text-xs text-foreground-muted">USP Bullets</label>
                                <span className="text-xs text-foreground-muted">
                                    {(newProduct.usps || '').length} / {CHAR_LIMITS.usps}
                                </span>
                            </div>
                            <textarea
                                value={newProduct.usps || ''}
                                onChange={(e) => setNewProduct({ ...newProduct, usps: e.target.value })}
                                placeholder="• First key selling point&#10;• Second key selling point&#10;• Third key selling point"
                                className="w-full h-24 px-4 py-3 bg-background-tertiary border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-accent-primary resize-none"
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setNewProduct(null)}
                                className="px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveNew}
                                disabled={!newProduct.name?.trim()}
                                className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg text-sm font-medium hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Check className="w-4 h-4" />
                                Add Product
                            </button>
                        </div>
                    </div>
                )}

                {/* Product List */}
                {products.length === 0 && !newProduct ? (
                    <div className="py-12 text-center text-foreground-muted">
                        <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">No products yet. Add your first product to get started.</p>
                    </div>
                ) : (
                    products.map(product => (
                        <div
                            key={product.id}
                            className="p-4 bg-background-tertiary border border-border rounded-xl"
                        >
                            {editingId === product.id ? (
                                /* Edit Mode */
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="text"
                                            value={product.emoji}
                                            onChange={(e) => handleUpdate(product.id, { emoji: e.target.value })}
                                            className="w-12 h-12 text-center text-2xl bg-background border border-border rounded-lg focus:outline-none focus:border-accent-primary"
                                        />
                                        <input
                                            type="text"
                                            value={product.name}
                                            onChange={(e) => handleUpdate(product.id, { name: e.target.value })}
                                            className="flex-1 px-4 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-accent-primary"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between">
                                            <label className="text-xs text-foreground-muted">USP Bullets</label>
                                            <span className="text-xs text-foreground-muted">
                                                {product.usps.length} / {CHAR_LIMITS.usps}
                                            </span>
                                        </div>
                                        <textarea
                                            value={product.usps}
                                            onChange={(e) => handleUpdate(product.id, { usps: e.target.value })}
                                            className="w-full h-24 px-4 py-3 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent-primary resize-none"
                                        />
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <button
                                            onClick={() => setEditingId(null)}
                                            className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg text-sm font-medium hover:bg-accent-primary/90 transition-colors"
                                        >
                                            <Check className="w-4 h-4" />
                                            Done
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* View Mode */
                                <div className="flex items-start gap-4">
                                    <span className="text-2xl">{product.emoji}</span>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-medium text-foreground">{product.name}</h4>
                                        {product.usps && (
                                            <p className="text-sm text-foreground-muted mt-1 whitespace-pre-wrap line-clamp-3">
                                                {product.usps}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => setEditingId(product.id)}
                                            className="p-2 text-foreground-muted hover:text-foreground hover:bg-background rounded-lg transition-colors"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(product.id)}
                                            className="p-2 text-foreground-muted hover:text-accent-error hover:bg-accent-error/10 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// For icon display in empty state
function Package({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
    );
}
