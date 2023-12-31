import memoizeOne from 'memoize-one';
import React from 'react';
import { PureComponent } from 'react';
import { ItemMeasurer } from './ItemMeasurer';

type ScrollDirection = any;

type ListItemAlign = 'start' | 'end' | 'center' | 'auto';

const getItemMetadata = (
  props: DynamicSizeListProps,
  index: number,
  listMetaData: any
) => {
  const { itemOffsetMap, itemSizeMap } = listMetaData;
  const { itemData } = props;
  // If the specified item has not yet been measured,
  // Just return an estimated size for now.
  if (!itemSizeMap[itemData[index]]) {
    return {
      offset: 0,
      size: 0,
    };
  }

  const offset = itemOffsetMap[itemData[index]] || 0;
  const size = itemSizeMap[itemData[index]] || 0;

  return { offset, size };
};

const getItemOffset = (
  props: DynamicSizeListProps,
  index: number,
  listMetaData: any
) => getItemMetadata(props, index, listMetaData).offset;

const getOffsetForIndexAndAlignment = (
  props: DynamicSizeListProps,
  index: number,
  align: ListItemAlign,
  scrollOffset: number,
  listMetaData: any
) => {
  const { height } = props;
  const itemMetadata = getItemMetadata(props, index, listMetaData);

  // Get estimated total size after ItemMetadata is computed,
  // To ensure it reflects actual measurements instead of just estimates.
  const estimatedTotalSize = listMetaData.totalMeasuredSize;

  const maxOffset = Math.max(
    0,
    itemMetadata.offset + itemMetadata.size - height
  );
  const minOffset = Math.max(0, itemMetadata.offset);

  switch (align) {
    case 'start':
      return minOffset;
    case 'end':
      return maxOffset;
    case 'center':
      return Math.round(minOffset - height / 2 + itemMetadata.size / 2);
    case 'auto':
    default:
      if (scrollOffset >= minOffset && scrollOffset <= maxOffset) {
        return estimatedTotalSize - (scrollOffset + height);
      } else if (scrollOffset - minOffset < maxOffset - scrollOffset) {
        return minOffset;
      } else {
        return maxOffset;
      }
  }
};

const findNearestItem = (
  props: DynamicSizeListProps,
  listMetaData: any,
  high: any,
  low: any,
  scrollOffset: any
) => {
  let index = low;
  while (low <= high) {
    const currentOffset = getItemMetadata(props, low, listMetaData).offset;
    if (scrollOffset - currentOffset <= 0) {
      index = low;
    }
    low++;
  }
  return index;
};

const getStartIndexForOffset = (props: any, offset: any, listMetaData: any) => {
  const { totalMeasuredSize } = listMetaData;
  const { itemData } = props;

  // If we've already positioned and measured past this point,
  // Use a binary search to find the closets cell.
  if (offset <= totalMeasuredSize) {
    return findNearestItem(props, listMetaData, itemData.length, 0, offset);
  }

  // Otherwise render a new batch of items starting from where 0.
  return 0;
};

const getStopIndexForStartIndex = (
  props: DynamicSizeListProps,
  startIndex: any,
  scrollOffset: any,
  listMetaData: any
) => {
  const { itemData } = props;

  let stopIndex = startIndex;
  const maxOffset = scrollOffset + props.height;
  const itemMetadata = getItemMetadata(props, stopIndex, listMetaData);
  let offset = itemMetadata.offset + (itemMetadata.size || 0);
  const closestOffsetIndex = 0;
  while (stopIndex > 0 && offset <= maxOffset) {
    const itemMetadata = getItemMetadata(props, stopIndex, listMetaData);
    offset = itemMetadata.offset + itemMetadata.size;
    stopIndex--;
  }

  if (stopIndex >= itemData.length) {
    return closestOffsetIndex;
  }

  return stopIndex;
};

const getItemSize = (
  props: DynamicSizeListProps,
  index: number,
  listMetaData: any
) => {
  // Do not hard-code item dimensions.
  // We don't know them initially.
  // Even once we do, changes in item content or list size should reflow.
  return getItemMetadata(props, index, listMetaData).size;
};

export interface OnScrollInfo {
  scrollDirection: 'backward' | 'forward';
  scrollOffset: number;
  scrollUpdateWasRequested: boolean;
  clientHeight: number;
  scrollHeight: number;
}

export interface DynamicSizeRenderInfo {
  data: string[];
  itemId: string;
}

interface DynamicSizeListProps {
  canLoadMorePosts: () => void;
  renderItem: (info: DynamicSizeRenderInfo) => React.ReactElement;
  height: number;
  initRangeToRender: number[];
  initScrollToIndex: () => {
    index: number;
    position?: ListItemAlign;
    offset?: number;
  };
  initialScrollOffset?: number;
  innerRef: React.RefObject<HTMLDivElement>;
  itemData: string[];
  onItemsRendered?: (args: any) => void;
  onScroll: (scrollArgs: OnScrollInfo) => void;
  overscanCountBackward: number;
  overscanCountForward: number;
  style: React.CSSProperties;
  width: number;
  outerRef?: any;
  className?: string;

  /**
   * 用于确保当滚动条处于底部时
   * 增加新的项能确保滚动条处于聊天框最底部
   */
  correctScrollToBottom?: boolean;
  innerListStyle?: React.CSSProperties;
  loaderId?: string;
  scrollToFailed?: (index: number) => void;
}
interface DynamicSizeListState {
  scrollDirection: 'backward' | 'forward';
  scrollOffset: number;
  scrollUpdateWasRequested: boolean;
  scrollDelta: number;
  scrollHeight: number;
  localOlderPostsToRender: [number, number];
  scrolledToInitIndex?: boolean;
}
type DynamicSizeListSnapshot = {
  previousScrollTop: number;
  previousScrollHeight: number;
} | null;

/**
 * 注意，该组件必须拥有一个loader
 */
export class DynamicSizeList extends PureComponent<
  DynamicSizeListProps,
  DynamicSizeListState
> {
  _listMetaData = {
    itemOffsetMap: {} as any,
    itemSizeMap: {} as any,
    totalMeasuredSize: 0,
    atBottom: true,
  };

  _itemStyleCache: any = {};
  _outerRef: HTMLDivElement | undefined;
  _scrollCorrectionInProgress = false;
  _scrollByCorrection: number | null = null;
  _keepScrollPosition = false;
  _keepScrollToBottom = false;
  _mountingCorrections = 0;
  _correctedInstances = 0;
  innerRefWidth = 0;

  state: DynamicSizeListState = {
    scrollDirection: 'backward',
    scrollOffset:
      typeof this.props.initialScrollOffset === 'number'
        ? this.props.initialScrollOffset
        : 0,
    scrollUpdateWasRequested: false,
    scrollDelta: 0,
    scrollHeight: 0,
    localOlderPostsToRender: [] as any,
  };

  // Always use explicit constructor for React components.
  // It produces less code after transpilation. (#26)
  // eslint-disable-next-line no-useless-constructor
  constructor(props: DynamicSizeListProps) {
    super(props);
  }

  static getDerivedStateFromProps(props: DynamicSizeListProps) {
    validateProps(props);
    return null;
  }

  scrollBy = (scrollOffset: number, scrollBy?: number) => () => {
    if (!this._outerRef) {
      return;
    }

    const element = this._outerRef;
    if (typeof element.scrollBy === 'function' && scrollBy) {
      element.scrollBy(0, scrollBy);
    } else if (scrollOffset) {
      element.scrollTop = scrollOffset;
    }

    this._scrollCorrectionInProgress = false;
  };

  scrollTo(
    scrollOffset: number,
    scrollByValue?: number,
    useAnimationFrame = false
  ) {
    this._scrollCorrectionInProgress = true;

    this.setState({
      scrollOffset,
      scrollUpdateWasRequested: true,
    });

    this.setState(
      (prevState) => ({
        scrollDirection:
          prevState.scrollOffset >= scrollOffset ? 'backward' : 'forward',
        scrollOffset: scrollOffset,
        scrollUpdateWasRequested: true,
      }),
      () => {
        if (useAnimationFrame) {
          this._scrollByCorrection = window.requestAnimationFrame(
            this.scrollBy(this.state.scrollOffset, scrollByValue)
          );
        } else {
          this.scrollBy(this.state.scrollOffset, scrollByValue)();
        }
      }
    );

    this.forceUpdate();
  }

  scrollToItem(index: number, align: ListItemAlign = 'auto', offset = 0) {
    if (!this._outerRef) {
      return;
    }

    const { scrollOffset } = this.state;

    //Ideally the below scrollTo works fine but firefox has 6px issue and stays 6px from bottom when corrected
    //so manually keeping scroll position bottom for now
    const element = this._outerRef;
    if (index === 0 && align === 'end') {
      this.scrollTo(element.scrollHeight - this.props.height);
      return;
    }
    const offsetOfItem = getOffsetForIndexAndAlignment(
      this.props,
      index,
      align,
      scrollOffset,
      this._listMetaData
    );
    if (!offsetOfItem) {
      const itemSize = getItemSize(this.props, index, this._listMetaData);
      if (!itemSize && this.props.scrollToFailed) {
        if (this.state.scrolledToInitIndex) {
          this.props.scrollToFailed(index);
        } else {
          console.warn(
            'Failed to do initial scroll correction',
            this.props.initRangeToRender,
            index
          );
        }
      }
    }

    this.scrollTo(offsetOfItem + offset);
  }

  componentDidMount() {
    if (!this._outerRef) {
      return;
    }

    const { initialScrollOffset } = this.props;

    if (typeof initialScrollOffset === 'number' && this._outerRef !== null) {
      const element = this._outerRef;
      element.scrollTop = initialScrollOffset;
    }

    this._commitHook();
  }

  getSnapshotBeforeUpdate(
    prevProps: DynamicSizeListProps,
    prevState: DynamicSizeListState
  ): DynamicSizeListSnapshot {
    if (this._outerRef) {
      const isChangedLocalOlderPostsToRender =
        prevState.localOlderPostsToRender[0] !==
          this.state.localOlderPostsToRender[0] ||
        prevState.localOlderPostsToRender[1] !==
          this.state.localOlderPostsToRender[1];

      if (isChangedLocalOlderPostsToRender) {
        const element = this._outerRef;
        const previousScrollTop = element.scrollTop;
        const previousScrollHeight = element.scrollHeight;
        return {
          previousScrollTop,
          previousScrollHeight,
        };
      }
    }

    return null;
  }

  componentDidUpdate(
    prevProps: DynamicSizeListProps,
    prevState: DynamicSizeListState,
    snapshot: DynamicSizeListSnapshot
  ) {
    if (this.state.scrolledToInitIndex) {
      // 如果一定滚动到初始位置
      const {
        scrollDirection,
        scrollOffset,
        scrollUpdateWasRequested,
        scrollHeight,
      } = this.state;

      const {
        scrollDirection: prevScrollDirection,
        scrollOffset: prevScrollOffset,
        scrollUpdateWasRequested: prevScrollUpdateWasRequested,
        scrollHeight: previousScrollHeight,
      } = prevState;

      if (
        scrollDirection !== prevScrollDirection ||
        scrollOffset !== prevScrollOffset ||
        scrollUpdateWasRequested !== prevScrollUpdateWasRequested ||
        scrollHeight !== previousScrollHeight
      ) {
        this._callPropsCallbacks();
      }
      if (!prevState.scrolledToInitIndex) {
        this._keepScrollPosition = false;
        this._keepScrollToBottom = false;
      }
    }

    this._commitHook();
    if (prevProps.itemData !== this.props.itemData) {
      this._dataChange();
    }

    if (prevProps.height !== this.props.height) {
      this._heightChange(prevProps.height, prevState.scrollOffset);
    }

    if (prevState.scrolledToInitIndex !== this.state.scrolledToInitIndex) {
      this._dataChange(); // though this is not data change we are checking for first load change
    }

    if (
      prevProps.width !== this.props.width &&
      !!this.props.innerRef &&
      !!this.props.innerRef.current
    ) {
      this.innerRefWidth = this.props.innerRef.current.clientWidth;
      this._widthChange(prevProps.height, prevState.scrollOffset);
    }

    if (
      prevState.localOlderPostsToRender[0] !==
        this.state.localOlderPostsToRender[0] ||
      prevState.localOlderPostsToRender[1] !==
        this.state.localOlderPostsToRender[1]
    ) {
      if (!this._outerRef) {
        return;
      }
      if (!snapshot) {
        return;
      }

      const postlistScrollHeight = this._outerRef.scrollHeight;

      const scrollValue =
        snapshot.previousScrollTop +
        (postlistScrollHeight - snapshot.previousScrollHeight);

      this.scrollTo(
        scrollValue,
        scrollValue - snapshot.previousScrollTop,
        true
      );
    }
  }

  componentWillUnmount() {
    if (this._scrollByCorrection) {
      window.cancelAnimationFrame(this._scrollByCorrection);
    }
  }

  render() {
    const { className, innerRef, style, innerListStyle } = this.props;

    const onScroll = this._onScrollVertical;

    const items = this._renderItems();

    return (
      <div
        className={className}
        onScroll={onScroll}
        ref={this._outerRefSetter}
        style={{
          WebkitOverflowScrolling: 'touch',
          overflowY: 'auto',
          overflowAnchor: 'none',
          willChange: 'transform',
          width: '100%',
          ...style,
        }}
      >
        <div ref={innerRef} style={innerListStyle}>
          {items}
        </div>
      </div>
    );
  }

  _callOnItemsRendered = memoizeOne(
    (
      overscanStartIndex: number,
      overscanStopIndex: number,
      visibleStartIndex: number,
      visibleStopIndex: number
    ) => {
      if (typeof this.props.onItemsRendered === 'function') {
        this.props.onItemsRendered({
          overscanStartIndex,
          overscanStopIndex,
          visibleStartIndex,
          visibleStopIndex,
        });
      }
    }
  );

  _callOnScroll = memoizeOne(
    (
      scrollDirection: ScrollDirection,
      scrollOffset: number,
      scrollUpdateWasRequested: boolean,
      scrollHeight: number,
      clientHeight: number
    ) =>
      this.props.onScroll({
        scrollDirection,
        scrollOffset,
        scrollUpdateWasRequested,
        scrollHeight,
        clientHeight,
      })
  );

  _callPropsCallbacks() {
    const { itemData, height } = this.props;
    const {
      scrollDirection,
      scrollOffset,
      scrollUpdateWasRequested,
      scrollHeight,
    } = this.state;
    const itemCount = itemData.length;

    if (typeof this.props.onItemsRendered === 'function') {
      if (itemCount > 0) {
        const [
          overscanStartIndex,
          overscanStopIndex,
          visibleStartIndex,
          visibleStopIndex,
        ] = this._getRangeToRender();

        this._callOnItemsRendered(
          overscanStartIndex,
          overscanStopIndex,
          visibleStartIndex,
          visibleStopIndex
        );

        if (
          scrollDirection === 'backward' &&
          scrollOffset < 1000 &&
          overscanStopIndex !== itemCount - 1
        ) {
          const sizeOfNextElement = getItemSize(
            this.props,
            overscanStopIndex + 1,
            this._listMetaData
          ).size;
          if (!sizeOfNextElement && this.state.scrolledToInitIndex) {
            this.setState((prevState) => {
              if (
                prevState.localOlderPostsToRender[0] !==
                overscanStopIndex + 1
              ) {
                return {
                  localOlderPostsToRender: [
                    overscanStopIndex + 1,
                    overscanStopIndex + 50,
                  ],
                };
              }
              return null;
            });
          }
        }
      }
    }

    if (typeof this.props.onScroll === 'function') {
      this._callOnScroll(
        scrollDirection,
        scrollOffset,
        scrollUpdateWasRequested,
        scrollHeight,
        height
      );
    }
  }

  // This method is called after mount and update.
  // List implementations can override this method to be notified.
  _commitHook = () => {
    if (
      !this.state.scrolledToInitIndex &&
      Object.keys(this._listMetaData.itemOffsetMap).length
    ) {
      const { index, position, offset } = this.props.initScrollToIndex();
      this.scrollToItem(index, position, offset);
      this.setState({
        scrolledToInitIndex: true,
      });

      if (index === 0) {
        this._keepScrollToBottom = true;
      } else {
        this._keepScrollPosition = true;
      }
    }
  };

  // This method is called when data changes
  // List implementations can override this method to be notified.
  _dataChange = () => {
    if (this._listMetaData.totalMeasuredSize < this.props.height) {
      this.props.canLoadMorePosts();
    }
  };

  _heightChange = (prevHeight: number, prevOffset: number) => {
    if (prevOffset + prevHeight >= this._listMetaData.totalMeasuredSize - 10) {
      this.scrollToItem(0, 'end');
      return;
    }
  };

  _widthChange = (prevHeight: number, prevOffset: number) => {
    if (prevOffset + prevHeight >= this._listMetaData.totalMeasuredSize - 10) {
      this.scrollToItem(0, 'end');
      return;
    }
  };

  // Lazily create and cache item styles while scrolling,
  // So that pure component sCU will prevent re-renders.
  // We maintain this cache, and pass a style prop rather than index,
  // So that List can clear cached styles and force item re-render if necessary.
  _getItemStyle = (index: number) => {
    const { itemData } = this.props;

    const itemStyleCache = this._itemStyleCache;

    let style;
    if (itemStyleCache.hasOwnProperty(itemData[index])) {
      style = itemStyleCache[itemData[index]];
    } else {
      itemStyleCache[itemData[index]] = style = {
        left: 0,
        top: getItemOffset(this.props, index, this._listMetaData),
        height: getItemSize(this.props, index, this._listMetaData),
        width: '100%',
      };
    }

    return style;
  };

  /**
   * 获取渲染范围
   */
  _getRangeToRender(scrollTop?: number): number[] {
    const { itemData, overscanCountForward, overscanCountBackward } =
      this.props;
    const { scrollDirection, scrollOffset } = this.state;
    const itemCount = itemData.length;

    if (itemCount === 0) {
      return [0, 0, 0, 0];
    }
    const scrollOffsetValue =
      typeof scrollTop === 'number' && scrollTop >= 0
        ? scrollTop
        : scrollOffset;
    const startIndex = getStartIndexForOffset(
      this.props,
      scrollOffsetValue,
      this._listMetaData
    );
    const stopIndex = getStopIndexForStartIndex(
      this.props,
      startIndex,
      scrollOffsetValue,
      this._listMetaData
    );

    // Overscan by one item in each direction so that tab/focus works.
    // If there isn't at least one extra item, tab loops back around.
    const overscanBackward =
      scrollDirection === 'backward'
        ? overscanCountBackward
        : Math.max(1, overscanCountForward);

    const overscanForward =
      scrollDirection === 'forward'
        ? overscanCountBackward
        : Math.max(1, overscanCountForward);

    const minValue = Math.max(0, stopIndex - overscanBackward);
    let maxValue = Math.max(
      0,
      Math.min(itemCount - 1, startIndex + overscanForward)
    );

    // 移除size为空的项
    // 注意，这里必须要确保最上有一个保留项
    while (
      getItemSize(this.props, maxValue, this._listMetaData) === 0 &&
      maxValue > 0 &&
      this._listMetaData.totalMeasuredSize > this.props.height
    ) {
      maxValue--;
    }

    if (
      !this.state.scrolledToInitIndex &&
      this.props.initRangeToRender.length
    ) {
      return this.props.initRangeToRender;
    }

    return [minValue, maxValue, startIndex, stopIndex];
  }

  _correctScroll = () => {
    const { scrollOffset } = this.state;
    const element = this._outerRef;
    if (element) {
      element.scrollTop = scrollOffset;
      this._scrollCorrectionInProgress = false;
      this._correctedInstances = 0;
      this._mountingCorrections = 0;
    }
  };

  _generateOffsetMeasurements = () => {
    const { itemOffsetMap, itemSizeMap } = this._listMetaData;
    const { itemData } = this.props;
    this._listMetaData.totalMeasuredSize = 0;

    for (let i = itemData.length - 1; i >= 0; i--) {
      const prevOffset = itemOffsetMap[itemData[i + 1]] || 0;

      // In some browsers (e.g. Firefox) fast scrolling may skip rows.
      // In this case, our assumptions about last measured indices may be incorrect.
      // Handle this edge case to prevent NaN values from breaking styles.
      // Slow scrolling back over these skipped rows will adjust their sizes.
      const prevSize = itemSizeMap[itemData[i + 1]] || 0;

      itemOffsetMap[itemData[i]] = prevOffset + prevSize;
      this._listMetaData.totalMeasuredSize += itemSizeMap[itemData[i]] || 0;
      // Reset cached style to clear stale position.
      delete this._itemStyleCache[itemData[i]];
    }
  };

  _handleNewMeasurements = (
    key: string,
    newSize: number,
    forceScrollCorrection: boolean
  ) => {
    const { itemSizeMap } = this._listMetaData;
    const { itemData } = this.props;
    const index = itemData.findIndex((item) => item === key);
    // In some browsers (e.g. Firefox) fast scrolling may skip rows.
    // In this case, our assumptions about last measured indices may be incorrect.
    // Handle this edge case to prevent NaN values from breaking styles.
    // Slow scrolling back over these skipped rows will adjust their sizes.
    const oldSize = itemSizeMap[key] || 0;
    if (oldSize === newSize) {
      return;
    }

    itemSizeMap[key] = newSize;

    if (!this.state.scrolledToInitIndex) {
      this._generateOffsetMeasurements();
      return;
    }

    if (!this._outerRef) {
      return;
    }
    const element = this._outerRef;
    const wasAtBottom =
      this.props.height + element.scrollTop >=
      this._listMetaData.totalMeasuredSize - 10;

    if (
      (wasAtBottom || this._keepScrollToBottom) &&
      this.props.correctScrollToBottom
    ) {
      this._generateOffsetMeasurements();
      this.scrollToItem(0, 'end');
      this.forceUpdate();
      return;
    }

    if (forceScrollCorrection || this._keepScrollPosition) {
      const delta = newSize - oldSize;
      const [, , visibleStartIndex] = this._getRangeToRender(
        this.state.scrollOffset
      );
      this._generateOffsetMeasurements();
      if (index < visibleStartIndex + 1) {
        return;
      }

      this._scrollCorrectionInProgress = true;

      this.setState(
        (prevState) => {
          let deltaValue;
          if (this._mountingCorrections === 0) {
            deltaValue = delta;
          } else {
            deltaValue = prevState.scrollDelta + delta;
          }
          this._mountingCorrections++;
          const newOffset = prevState.scrollOffset + delta;
          return {
            scrollOffset: newOffset,
            scrollDelta: deltaValue,
          };
        },
        () => {
          // $FlowFixMe Property scrollBy is missing in HTMLDivElement
          this._correctedInstances++;
          if (this._mountingCorrections === this._correctedInstances) {
            this._correctScroll();
          }
        }
      );
      return;
    }

    this._generateOffsetMeasurements();
  };

  _onItemRowUnmount = (itemId: string, index: number) => {
    const { props } = this;
    if (props.itemData[index] === itemId) {
      return;
    }
    const doesItemExist = props.itemData.includes(itemId);
    if (!doesItemExist) {
      delete this._listMetaData.itemSizeMap[itemId];
      delete this._listMetaData.itemOffsetMap[itemId];

      if (!this._outerRef) {
        return;
      }
      const element = this._outerRef;

      const atBottom =
        element.offsetHeight + element.scrollTop >=
        this._listMetaData.totalMeasuredSize - 10;
      this._generateOffsetMeasurements();
      if (atBottom) {
        this.scrollToItem(0, 'end');
      }
      this.forceUpdate();
    }
  };

  _renderItems = () => {
    const { renderItem, itemData, loaderId } = this.props;
    const width = this.innerRefWidth;
    const [startIndex, stopIndex] = this._getRangeToRender();
    const itemCount = itemData.length;
    const items = [];
    if (itemCount > 0) {
      for (let index = itemCount - 1; index >= 0; index--) {
        const { size } = getItemMetadata(this.props, index, this._listMetaData);

        const [
          localOlderPostsToRenderStartIndex,
          localOlderPostsToRenderStopIndex,
        ] = this.state.localOlderPostsToRender;

        const isItemInLocalPosts =
          index >= localOlderPostsToRenderStartIndex &&
          index < localOlderPostsToRenderStopIndex + 1 &&
          localOlderPostsToRenderStartIndex === stopIndex + 1;

        const isLoader = itemData[index] === loaderId;
        const itemId = itemData[index];

        // It's important to read style after fetching item metadata.
        // getItemMetadata() will clear stale styles.
        const style = this._getItemStyle(index);
        if (
          (index >= startIndex && index < stopIndex + 1) ||
          isItemInLocalPosts ||
          isLoader
        ) {
          const item: React.ReactElement = renderItem({
            data: itemData,
            itemId,
          });

          // Always wrap children in a ItemMeasurer to detect changes in size.
          items.push(
            <ItemMeasurer
              handleNewMeasurements={this._handleNewMeasurements}
              index={index}
              item={item}
              key={itemId}
              size={size}
              itemId={itemId}
              width={width}
              onUnmount={this._onItemRowUnmount}
            />
          );
        } else {
          items.push(<div key={itemId} style={style} />);
        }
      }
    }

    return items;
  };

  _onScrollVertical = (event: React.UIEvent<HTMLDivElement, UIEvent>) => {
    if (!this.state.scrolledToInitIndex) {
      return;
    }
    const { scrollTop, scrollHeight } = event.currentTarget;
    if (this._scrollCorrectionInProgress) {
      if (this.state.scrollUpdateWasRequested) {
        this.setState(() => ({
          scrollUpdateWasRequested: false,
        }));
      }
      return;
    }

    if (scrollHeight !== this.state.scrollHeight) {
      this.setState({
        scrollHeight,
      });
    }

    this.setState((prevState: DynamicSizeListState) => {
      if (prevState.scrollOffset === scrollTop) {
        // Scroll position may have been updated by cDM/cDU,
        // In which case we don't need to trigger another render,
        return null;
      }

      return {
        ...prevState,
        scrollDirection:
          prevState.scrollOffset < scrollTop ? 'forward' : 'backward',
        scrollOffset: scrollTop,
        scrollUpdateWasRequested: false,
        scrollHeight,
        scrollTop,
        scrollDelta: 0,
      };
    });
  };

  _outerRefSetter = (ref: HTMLDivElement) => {
    if (!this.props.innerRef.current) {
      return;
    }

    const { outerRef } = this.props;

    this.innerRefWidth = this.props.innerRef.current.clientWidth;
    this._outerRef = ref;

    if (typeof outerRef === 'function') {
      outerRef(ref);
    } else if (
      outerRef != null &&
      typeof outerRef === 'object' &&
      outerRef.hasOwnProperty('current')
    ) {
      outerRef.current = ref;
    }
  };
}

// NOTE: I considered further wrapping individual items with a pure ListItem component.
// This would avoid ever calling the render function for the same index more than once,
// But it would also add the overhead of a lot of components/fibers.
// I assume people already do this (render function returning a class component),
// So my doing it would just unnecessarily double the wrappers.

const validateProps = ({ renderItem }: DynamicSizeListProps) => {
  if (process.env.NODE_ENV !== 'production') {
    if (renderItem == null) {
      throw Error(
        'An invalid "renderItem" prop has been specified. ' +
          'Value should be a React component. ' +
          `"${renderItem === null ? 'null' : typeof renderItem}" was specified.`
      );
    }
  }
};
