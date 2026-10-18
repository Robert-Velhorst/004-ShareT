import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown, CreditCard, LayoutDashboard, List } from 'lucide-react';

const TrelloTargetPicker = ({
  boards,
  shareType,
  selectedBoard,
  selectedCard,
  selectedList,
  onSelect,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const isListMode = shareType === 'list';

  const groups = useMemo(() => (
    boards
      .map((board) => ({
        board,
        targets: isListMode
          ? (board.lists || []).map((list) => ({ list, card: null }))
          : (board.lists || []).flatMap((list) => (
              (list.cards || []).map((card) => ({ list, card }))
            )),
      }))
      .filter((group) => group.targets.length > 0)
  ), [boards, isListMode]);

  const targetCount = useMemo(
    () => groups.reduce((total, group) => total + group.targets.length, 0),
    [groups]
  );
  const selectedTarget = isListMode ? selectedList : selectedCard;

  const handleOpenChange = (nextOpen) => {
    setOpen(nextOpen);
    if (!nextOpen) setQuery('');
  };

  const handleSelect = (board, list, card) => {
    onSelect({ board, list, card });
    handleOpenChange(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="trelloTargetPicker">
        {isListMode ? 'Find a list' : 'Find a card'}
      </Label>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            id="trelloTargetPicker"
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={isListMode ? 'Find a Trello list' : 'Find a Trello card'}
            className="h-auto min-h-12 w-full justify-between px-3 py-2 text-left font-normal"
          >
            <span className="flex min-w-0 items-center gap-3">
              {isListMode
                ? <List data-icon="inline-start" />
                : <CreditCard data-icon="inline-start" />}
              {selectedTarget ? (
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium text-foreground">
                    {selectedTarget.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {selectedBoard?.organizationName || 'Personal'} · {selectedBoard?.name}
                    {!isListMode && selectedList?.name ? ` · ${selectedList.name}` : ''}
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {isListMode ? 'Search available lists' : 'Search available cards'}
                </span>
              )}
            </span>
            <ChevronsUpDown data-icon="inline-end" className="shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] p-0"
        >
          <Command
            filter={(value, search) => (
              value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) ? 1 : 0
            )}
          >
            <CommandInput
              placeholder={isListMode
                ? 'Search list, board, or workspace…'
                : 'Search card, list, board, or workspace…'}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-[360px]">
              <CommandEmpty>
                No {isListMode ? 'lists' : 'cards'} match your search.
              </CommandEmpty>
              {groups.map(({ board, targets }) => (
                <CommandGroup
                  key={board.id}
                  heading={`${board.name} · ${board.organizationName || 'Personal'}`}
                >
                  {targets.map(({ list, card }) => {
                    const target = isListMode ? list : card;
                    const isSelected = selectedBoard?.id === board.id
                      && selectedTarget?.id === target.id;
                    const searchValue = [
                      target.name,
                      list.name,
                      board.name,
                      board.organizationName || 'Personal',
                      target.id,
                    ].join(' ');

                    return (
                      <CommandItem
                        key={`${board.id}-${target.id}`}
                        value={searchValue}
                        onSelect={() => handleSelect(board, list, card)}
                        className="gap-3 py-2.5"
                      >
                        {isListMode
                          ? <List className="size-4 shrink-0 text-muted-foreground" />
                          : <CreditCard className="size-4 shrink-0 text-muted-foreground" />}
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate font-medium">{target.name}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {isListMode
                              ? `${(list.cards || []).length} ${(list.cards || []).length === 1 ? 'card' : 'cards'}`
                              : list.name}
                          </span>
                        </span>
                        {isSelected ? <Check className="size-4 shrink-0" /> : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LayoutDashboard className="size-3.5" />
        {targetCount} {targetCount === 1
          ? (isListMode ? 'list' : 'card')
          : (isListMode ? 'lists' : 'cards')} available across {boards.length} board{boards.length !== 1 ? 's' : ''}. Search by name, board, list, or workspace.
      </p>
      {targetCount === 0 && boards.length > 0 && (
        <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <span className="mt-0.5 shrink-0">⚠️</span>
          <span>
            {boards.length} board{boards.length !== 1 ? 's were' : ' was'} found but no cards could be loaded.
            This usually means your Trello account is invited to these boards but doesn't have card-read access yet,
            or the board is private. Make sure the <strong>noodzakelijkonline</strong> account is an active member
            on every board you want to share cards from.
          </span>
        </p>
      )}
    </div>
  );
};

export default TrelloTargetPicker;
