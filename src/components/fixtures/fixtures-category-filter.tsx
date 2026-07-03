"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { cn } from "@/lib/utils";

// Client soft-navigation for the fixtures category chips. Switching category is
// a segment navigation driven inside a transition, so the current table stays
// visible (React keeps the already-rendered Suspense content instead of flashing
// the skeleton) while the new category streams in. The chips render as real
// <Link>s — no full-document reload.
export function FixturesCategoryFilter({
  categories,
  activeCategory,
}: {
  categories: string[];
  activeCategory: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleNavigate(
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) {
    event.preventDefault();
    startTransition(() => {
      router.push(href);
    });
  }

  function chipClassName(active: boolean) {
    return cn(
      "px-3 py-1 rounded-full text-sm font-medium border transition-colors",
      active
        ? "bg-blue-600 text-white border-blue-600"
        : "border-gray-300 text-gray-600 hover:bg-gray-50",
    );
  }

  return (
    <div
      className={cn(
        "flex gap-2 flex-wrap transition-opacity",
        isPending && "opacity-60",
      )}
      aria-busy={isPending}
    >
      <Link
        href="/fixtures"
        onClick={(event) => handleNavigate(event, "/fixtures")}
        aria-current={!activeCategory ? "page" : undefined}
        className={chipClassName(!activeCategory)}
      >
        Todas
      </Link>
      {categories.map((cat) => {
        const href = `/fixtures?category=${encodeURIComponent(cat)}`;

        return (
          <Link
            key={cat}
            href={href}
            onClick={(event) => handleNavigate(event, href)}
            aria-current={cat === activeCategory ? "page" : undefined}
            className={chipClassName(cat === activeCategory)}
          >
            {cat}
          </Link>
        );
      })}
    </div>
  );
}
