import React, {FunctionComponent} from 'react'
import styles from './FullHierarchyTable.less'
import {WidgetListField, WidgetTableMeta} from '../../interfaces/widget'
import {AssociatedItem} from '../../interfaces/operation'
import {Store} from '../../interfaces/store'
import {Dispatch} from 'redux'
import {connect} from 'react-redux'
import {Button, Form, Icon, Input, Skeleton, Table} from 'antd'
import {ColumnProps, TableRowSelection, TableEventListeners} from 'antd/lib/table'
import {DataItem, MultivalueSingleValue, PendingDataItem} from '../../interfaces/data'
import {FieldType} from '../../interfaces/view'
import MultivalueHover from '../ui/Multivalue/MultivalueHover'
import Field from '../Field/Field'
import {useAssocRecords} from '../../hooks/useAssocRecords'
import {$do} from '../../actions/actions'
import {useTranslation} from 'react-i18next'
import filterIcon from '../ColumnTitle/filter-solid.svg'
import {BcFilter, FilterType} from '../../interfaces/filters'
import {buildBcUrl} from '../../utils/strings'
import {RowMetaField} from '../../interfaces/rowMeta'
import {FilterDropdownProps} from 'antd/es/table'

export interface FullHierarchyTableOwnProps {
    meta: WidgetTableMeta,
    nestedData?: AssociatedItem[],
    assocValueKey?: string,
    depth?: number,
    parentId?: string,
    selectable?: boolean,
    expandedRowKeys?: string[],
    searchPlaceholder?: string,
    onRow?: (record: DataItem, index: number) => TableEventListeners
}

interface FullHierarchyTableProps {
    data: AssociatedItem[],
    loading: boolean,
    pendingChanges: Record<string, PendingDataItem>,
    bcFilters: BcFilter[],
    rowMetaFields: RowMetaField[],
}

interface FullHierarchyTableDispatchProps {
    onSelect: (bcName: string, depth: number, dataItem: AssociatedItem, widgetName: string, assocValueKey: string) => void,
    onDeselectAll: (bcName: string, depthFrom: number) => void,
    onSelectAll: (bcName: string, parentId: string, depth: number, assocValueKey: string, selected: boolean) => void,
    onSelectFullTable?: (bcName: string, dataItems: AssociatedItem[], assocValueKey: string, selected: boolean) => void,
    addFilter?: (bcName: string, filter: BcFilter) => void,
    removeFilter?: (bcName: string, filter: BcFilter) => void,
}

interface FullHierarchyDataItem extends AssociatedItem {
    parentId: string,
    level: number
}

export type FullHierarchyTableAllProps = FullHierarchyTableOwnProps & FullHierarchyTableProps & FullHierarchyTableDispatchProps

const emptyData: AssociatedItem[] = []
const emptyMultivalue: MultivalueSingleValue[] = []

const Exp: FunctionComponent = (props: any) => {
    if (!props.onExpand || props.record.noChildren) {
        return null
    }
    const type = props.expanded ? 'minus-square' : 'plus-square'
    return <Icon
        style={{ fontSize: '20px' }}
        type={type}
        onClick={e => props.onExpand(props.record, e)}
    />
}

export const FullHierarchyTable: React.FunctionComponent<FullHierarchyTableAllProps> = (props) => {
    const bcName = props.meta.bcName
    const fields = props.meta.fields
    const loading = props.loading
    const depthLevel = props.depth || 1
    const indentLevel = depthLevel - 1
    const {t} = useTranslation()
    const [userOpenedRecords, setUserOpenedRecords] = React.useState([])

    React.useEffect(
        () => {
            if (props?.expandedRowKeys) {setUserOpenedRecords(props.expandedRowKeys)}
        },
        [props.expandedRowKeys]
    )
    const [inputPlaceholder, setInputPlaceholder] = React.useState(props?.searchPlaceholder || '')

    const filterableFieldsKeys = React.useMemo(() => props.rowMetaFields
            .filter(field => field.filterable)
            .map(field => field.key),
        [props.rowMetaFields])

    const textFilters = React.useMemo(() => props.bcFilters?.filter(filter =>
            [FilterType.contains, FilterType.equals].includes(filter.type)),
        [props.bcFilters]
    )

    const searchedAncestorsKeys: Set<string> = React.useMemo(() => {
        const result: string[] = []
        props.data.forEach(item => {
            bcFilterMatchedAncestors(item as FullHierarchyDataItem, props.data as FullHierarchyDataItem[], textFilters)
                ?.forEach(key => result.push(key))
        })
        return new Set(result)
    }, [props.data, textFilters])

    const searchedDescendantsKeys: Set<string> = React.useMemo(() => {
        const result: string[] = []
        props.data.forEach(item => {
            bcFilterMatchedDescendants(item as FullHierarchyDataItem, props.data as FullHierarchyDataItem[], textFilters)
                ?.forEach(key => result.push(key))
        })
        return new Set(result)
    }, [props.data, textFilters])

    const filteredData = React.useMemo(() => {
        return textFilters?.length
            ? props.data.filter(item => searchedAncestorsKeys.has(item.id) || searchedDescendantsKeys.has(item.id))
            : props.data
    }, [searchedAncestorsKeys, searchedDescendantsKeys, props.data, textFilters])

    const data = (props?.nestedData?.length > 0 && depthLevel > 1)
        ? props.nestedData
        : props?.bcFilters?.length > 0
            ? filteredData
            : props.data

    const selectedRecords = useAssocRecords(data, props.pendingChanges)

    // get expand row keys
    React.useEffect(
        () => {
            const expandManual = props.expandedRowKeys || []
            const expandAssoc = selectedRecords?.filter(item => selectedRecords.some(child => item.id === child.parentId))
                .map(item => item.id) || []
            const ancestorsData = filteredData?.filter(item => searchedAncestorsKeys.has(item.id))
            const expandFiltered = textFilters?.length
                // Filter out leafs without children
                ? ancestorsData?.filter(item => ancestorsData.some(child => item.id === child.parentId)).map(item => item.id)
                : []
            const newExpandedKeys = new Set([...expandManual, ...expandAssoc,...expandFiltered])
            if (newExpandedKeys.size > 0) {
                setUserOpenedRecords(Array.from(newExpandedKeys))
            }
        },
        [props.expandedRowKeys, textFilters, filteredData, selectedRecords]
    )

    const {
        hierarchyGroupSelection,
        hierarchyGroupDeselection,
        hierarchyRadioAll,
        hierarchyRadio: hierarchyRootRadio,
        hierarchyDisableRoot
    } = props.meta.options ?? {}

    const tableRecords = React.useMemo(
        () => {
            return data?.filter((dataItem) => {
                return dataItem.level === depthLevel && (dataItem.level === 1 || dataItem.parentId === props.parentId)
            })
                .map((filteredItem) => {
                    return {
                        ...filteredItem,
                        noChildren: !data.find((dataItem) => dataItem.parentId === filteredItem.id)
                    }
                })
        },
        [data, props.parentId, depthLevel]
    )

    const handleExpand = (expanded: boolean, dataItem: DataItem) => {
        if (expanded) {
            setUserOpenedRecords((prevState => prevState ? [...prevState,dataItem.id] : [dataItem.id]))
        } else {
            setUserOpenedRecords((prevState => prevState?.filter(item => item !== dataItem.id)))
        }
    }

    const handleCancel = (clearFilters: () => void, selectedKeys: React.Key[], filterKey: string) => {
        clearFilters()
        const bcFilter = {
            type: FilterType.contains,
            fieldName: filterKey,
            value: selectedKeys[0]
        }
        props.removeFilter(bcName, bcFilter)
        setUserOpenedRecords([])
    }

    const handleApply = (confirm: () => void, selectedKeys: React.Key[], filterKey: string) => {
        const searchString: string = selectedKeys[0] as string
        if (searchString?.length) {
            confirm()
            const bcFilter = {
                type: FilterType.contains,
                fieldName: filterKey,
                value: searchString
            }
            props.addFilter(bcName, bcFilter)
        } else {
            setInputPlaceholder(t('Enter value'))
        }
    }

    const rowSelection: TableRowSelection<DataItem> = React.useMemo(() => {
        if (props.selectable) {
            return {
                type: 'checkbox',
                selectedRowKeys: selectedRecords.map(item => item.id),
                onSelectAll: () => {
                    const selected = selectedRecords?.length ? false : true
                    props.onSelectFullTable(bcName, props.data, props.assocValueKey, selected)
                },
                onSelect: (record: AssociatedItem, selected: boolean) => {
                    const dataItem = {
                        ...record,
                        _associate: selected,
                        _value: record[props.assocValueKey],
                    }

                    if (hierarchyRadioAll) {
                        props.onDeselectAll(bcName, depthLevel)
                    } else if (hierarchyRootRadio && depthLevel === 1 && selected) {
                        const rootSelectedRecord = selectedRecords.find((item) => item.level === 1)
                        if (rootSelectedRecord) {
                            props.onSelect(
                                bcName,
                                depthLevel,
                                { ...rootSelectedRecord, _associate: false },
                                props.meta.name,
                                props.assocValueKey
                            )
                        }
                    }

                    if (!selected && hierarchyGroupDeselection || selected && hierarchyGroupSelection) {
                        props.onSelectAll(bcName, record.id, depthLevel + 1, props.assocValueKey, selected)
                    }

                    props.onSelect(bcName, depthLevel, dataItem, props.meta.name, props.assocValueKey)
                }
            }
        }
        return undefined
    }, [bcName, props.onSelect, props.parentId, selectedRecords, props.assocValueKey, depthLevel, props.parentId])

    // Nested hierarchy level is drown by another table
    const nestedHierarchy = (record: DataItem, index: number, indent: number, expanded: boolean) => {
        return <ConnectedFullHierarchyTable
            meta={props.meta}
            nestedData={data?.filter(item => item.level > depthLevel)}
            assocValueKey={props.assocValueKey}
            depth={depthLevel + 1}
            parentId={record.id}
            selectable={props.selectable}
            onRow={props.onRow}
            expandedRowKeys={userOpenedRecords}
        />
    }

    // Hierarchy levels are indented by empty columns with calculated width
    const indentColumn = {
        title: '',
        key: '_indentColumn',
        dataIndex: null as string,
        className: styles.selectColumn,
        width: `${50 + indentLevel * 50}px`,
        render: (text: string, dataItem: AssociatedItem): React.ReactNode => {
            return null
        }
    }

    const customDropdown = (dropdownProps: FilterDropdownProps, key: string) =>
        <div className={styles.filterContent}>
            <Form layout="vertical">
                <Input
                    autoFocus
                    placeholder={inputPlaceholder}
                    value={dropdownProps.selectedKeys[0]}
                    suffix={<Icon type="search"/>}
                    onChange={(e) => {
                        dropdownProps.setSelectedKeys(e.target.value ? [e.target.value] : [])
                    }}
                    maxLength={50}
                />
                <div className={styles.operators}>
                    <Button className={styles.button} htmlType="submit" onClick={() => handleApply(
                        dropdownProps.confirm,
                        dropdownProps.selectedKeys,
                        key)}>
                        {t('Apply')}
                    </Button>
                    <Button className={styles.button} onClick={() => handleCancel(
                        dropdownProps.clearFilters,
                        dropdownProps.selectedKeys,
                        key)}>
                        {t('Clear')}
                    </Button>
                </div>
            </Form>
        </div>

    const dropDown = (filterKeys: string[], key: string) => {
        if (filterKeys.includes(key)) {
            return {
                filterDropdown: (dropdownProps: FilterDropdownProps) => customDropdown(dropdownProps, key),
                onFilterDropdownVisibleChange: (visible: boolean) => {
                    if (visible) {
                        setInputPlaceholder('')
                    }
                },
                filterIcon: <div style={
                    { color: props?.bcFilters?.filter(filterItem => filterItem.fieldName === key)?.length > 0 ? '#555555' : undefined }}
                                 dangerouslySetInnerHTML={{__html: filterIcon}}
                />,
            }
        } else
            return {}
    }

    const columns: Array<ColumnProps<DataItem>> = React.useMemo(() => {
        return [
            indentColumn,
            ...fields
                ?.filter((item: WidgetListField) => item.type !== FieldType.hidden && !item.hidden)
                .map((item: WidgetListField) => ({
                    title: item.title,
                    key: item.key,
                    dataIndex: item.key,
                    ...dropDown(filterableFieldsKeys, item.key),
                    render: (text: string, dataItem: AssociatedItem) => {
                        if (item.type === FieldType.multivalue) {
                            return <MultivalueHover
                                data={(dataItem[item.key] || emptyMultivalue) as MultivalueSingleValue[]}
                                displayedValue={item.displayedKey && dataItem[item.displayedKey]}
                            />
                        }

                        return <Field
                            bcName={bcName}
                            cursor={dataItem.id}
                            widgetName={props.meta.name}
                            widgetFieldMeta={item}
                            readonly
                        />
                    }
                }))
        ]
    }, [inputPlaceholder, indentLevel, fields, props.meta.name, textFilters])

    return loading
        ? <Skeleton loading paragraph={{rows: 5}}/>
        : <div className={styles.container}>
            <Table
                className={styles.table}
                rowSelection={rowSelection}
                rowKey="id"
                columns={columns}
                pagination={false}
                showHeader={depthLevel === 1}
                expandIcon={Exp as any}
                defaultExpandedRowKeys={undefined}
                expandedRowKeys={userOpenedRecords || []}
                onExpand={handleExpand}
                dataSource={tableRecords}
                expandedRowRender={nestedHierarchy}
                expandIconAsCell={false}
                expandIconColumnIndex={(props.selectable) ? 1 : 0}
                loading={loading}
                onRow={!(hierarchyDisableRoot && depthLevel === 1) && props.onRow}
                getPopupContainer={(trigger: HTMLElement) => trigger.parentNode.parentNode as HTMLElement}
            />
        </div>
}


/**
 * Function match whether filters are assigned to the input data element
 *
 * @param dataItem item to be checked
 * @param filters array of applied filters
 */
function bcFilterTextMatch(dataItem: FullHierarchyDataItem, filters: BcFilter[]) {
    if (filters?.length === 0) {
        return true
    }
    return filters?.every(filter => {
        const filterable = typeof dataItem[filter.fieldName] === 'string' || typeof dataItem[filter.fieldName] === 'number'
        const searchExpression = String(filter.value).toLowerCase()
        const value = String(dataItem[filter.fieldName]).toLowerCase()
        return filterable && value.includes(searchExpression)
    })
}

/**
 * Function search ancestors id in tree by input element dataItem
 *
 * @param dataItem item to be checked
 * @param dataItems full tree dataItems
 * @param filters array of applied filters
 */
function bcFilterMatchedAncestors(dataItem: FullHierarchyDataItem, dataItems: FullHierarchyDataItem[], filters: BcFilter[]) {
    const result: string[] = []
    if (bcFilterTextMatch(dataItem, filters)) {
        let current = dataItem
        // sibling include
        // dataItems.filter(sibling => sibling.parentId === current.parentId).forEach(sibling => result.push(sibling.id))
        do {
            result.push(current.id)
            current = dataItems.find(item => item.id === current.parentId)
        } while(current?.parentId)
    }
    return result
}

/**
 * Function search descendants id in tree by input element dataItem
 *
 * @param dataItem item to be checked
 * @param dataItems full tree dataItems
 * @param filters array of applied filters
 */
function bcFilterMatchedDescendants(dataItem: FullHierarchyDataItem, dataItems: FullHierarchyDataItem[], filters: BcFilter[]) {
    const result: string[] = []
    if (bcFilterTextMatch(dataItem, filters)) {
        const filteredData = [dataItem]
        while (filteredData?.length > 0) {
            const tempAncestor = filteredData.shift()
            result.push(tempAncestor.id)
            const tmpDescendant = dataItems?.filter(item => item.parentId === tempAncestor.id)
            if (tmpDescendant?.length > 0) {
                tmpDescendant.forEach(child => filteredData.push(child))
            }
        }
    }
    return result
}

function mapStateToProps(store: Store, ownProps: FullHierarchyTableOwnProps): FullHierarchyTableProps {
    const bcName = ownProps.meta.bcName
    const bc = store.screen.bo.bc[bcName]
    const bcUrl = buildBcUrl(bcName, true)
    const rowMeta = store.view.rowMeta[bcName]?.[bcUrl]
    const loading = bc?.loading || !rowMeta
    return {
        loading: loading,
        data: (loading) ? emptyData : store.data[bcName] as AssociatedItem[],
        pendingChanges: store.view.pendingDataChanges[bcName],
        bcFilters: store.screen.filters[bcName],
        rowMetaFields: store.view.rowMeta[bcName]?.[bcUrl]?.fields,
    }
}

function mapDispatchToProps(dispatch: Dispatch, ownProps: FullHierarchyTableOwnProps): FullHierarchyTableDispatchProps {
    return {
        onSelect: (bcName: string, depth: number, dataItem: AssociatedItem, widgetName: string, assocValueKey: string) => {
            dispatch($do.changeAssociationFull({ bcName, depth, widgetName: widgetName, dataItem, assocValueKey }))
        },
        onDeselectAll: (bcName: string, depthFrom: number) => {
            dispatch($do.dropAllAssociationsFull({ bcName, depth: depthFrom, dropDescendants: true }))
        },
        onSelectAll: (bcName: string, parentId: string, depth: number, assocValueKey: string, selected: boolean) => {
            dispatch($do.changeDescendantsAssociationsFull({ bcName, parentId, depth, assocValueKey, selected }))
        },
        onSelectFullTable: (bcName: string, dataItems: AssociatedItem[], assocValueKey: string, selected: boolean) => {
            dispatch($do.changeChildrenAssociations({ bcName, assocValueKey, selected }))
        },
        addFilter: (bcName: string, filter: BcFilter) => {
            dispatch($do.bcAddFilter({ bcName, filter }))
        },
        removeFilter: (bcName: string, filter: BcFilter) => {
            dispatch($do.bcRemoveFilter({bcName, filter}))
        }
    }
}

const ConnectedFullHierarchyTable = connect(mapStateToProps, mapDispatchToProps)(FullHierarchyTable)
export default ConnectedFullHierarchyTable
