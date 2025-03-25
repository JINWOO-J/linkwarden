import React, { Dispatch, SetStateAction, useEffect } from "react";
import { CollectionSort } from "@/types/global";
import { dropdownTriggerer } from "@/lib/client/utils";
import { TFunction } from "i18next";

type Props = {
  sortBy: CollectionSort;
  setSort: Dispatch<SetStateAction<CollectionSort>>;
  t: TFunction<"translation", undefined>;
};

export default function CollectionSortDropdown({ sortBy, setSort, t }: Props) {
  useEffect(() => {
    // 정렬 선택을 로컬 스토리지에 저장
    localStorage.setItem("collectionSortBy", sortBy.toString());
  }, [sortBy]);

  return (
    <div className="dropdown dropdown-bottom dropdown-end">
      <div
        tabIndex={0}
        role="button"
        onMouseDown={dropdownTriggerer}
        className="btn btn-sm btn-square btn-ghost border-none"
      >
        <i className="bi-chevron-expand text-neutral text-2xl"></i>
      </div>
      <ul className="dropdown-content z-[30] menu shadow bg-base-200 border border-neutral-content rounded-xl mt-1">
        <li>
          <label
            className="label cursor-pointer flex justify-start"
            tabIndex={0}
            role="button"
          >
            <input
              type="radio"
              name="collection-sort-radio"
              className="radio checked:bg-primary"
              checked={sortBy === CollectionSort.NameAZ}
              onChange={() => {
                setSort(CollectionSort.NameAZ);
              }}
            />
            <span className="label-text whitespace-nowrap">
              {t("name_az")}
            </span>
          </label>
        </li>
        <li>
          <label
            className="label cursor-pointer flex justify-start"
            tabIndex={0}
            role="button"
          >
            <input
              type="radio"
              name="collection-sort-radio"
              className="radio checked:bg-primary"
              checked={sortBy === CollectionSort.NameZA}
              onChange={() => {
                setSort(CollectionSort.NameZA);
              }}
            />
            <span className="label-text whitespace-nowrap">{t("name_za")}</span>
          </label>
        </li>
        <li>
          <label
            className="label cursor-pointer flex justify-start"
            tabIndex={0}
            role="button"
          >
            <input
              type="radio"
              name="collection-sort-radio"
              className="radio checked:bg-primary"
              checked={sortBy === CollectionSort.DateNewestFirst}
              onChange={() => {
                setSort(CollectionSort.DateNewestFirst);
              }}
            />
            <span className="label-text whitespace-nowrap">
              {t("date_newest_first")}
            </span>
          </label>
        </li>
        <li>
          <label
            className="label cursor-pointer flex justify-start"
            tabIndex={0}
            role="button"
          >
            <input
              type="radio"
              name="collection-sort-radio"
              className="radio checked:bg-primary"
              checked={sortBy === CollectionSort.DateOldestFirst}
              onChange={() => {
                setSort(CollectionSort.DateOldestFirst);
              }}
            />
            <span className="label-text whitespace-nowrap">
              {t("date_oldest_first")}
            </span>
          </label>
        </li>
      </ul>
    </div>
  );
} 