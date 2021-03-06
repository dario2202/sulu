// @flow
import React from 'react';
import {action, observable, reaction, toJS, when} from 'mobx';
import {observer} from 'mobx-react';
import debounce from 'debounce';
import classNames from 'classnames';
import {Loader, Toolbar} from 'sulu-admin-bundle/components';
import {ResourceFormStore, sidebarStore} from 'sulu-admin-bundle/containers';
import {Router} from 'sulu-admin-bundle/services';
import {ResourceListStore} from 'sulu-admin-bundle/stores';
import {translate} from 'sulu-admin-bundle/utils';
import {webspaceStore} from 'sulu-page-bundle/stores';
import previewStyles from './preview.scss';
import PreviewStore from './stores/PreviewStore';
import type {PreviewMode} from './types';

type Props = {|
    formStore: ResourceFormStore,
    router: Router,
|};

@observer
class Preview extends React.Component<Props> {
    static debounceDelay: number = 250;
    static mode: PreviewMode = 'auto';
    static audienceTargeting: boolean = false;

    availableDeviceOptions = [
        {label: translate('sulu_preview.auto'), value: 'auto'},
        {label: translate('sulu_preview.desktop'), value: 'desktop'},
        {label: translate('sulu_preview.tablet'), value: 'tablet'},
        {label: translate('sulu_preview.smartphone'), value: 'smartphone'},
    ];

    @observable iframeRef: ?HTMLIFrameElement;
    @observable started: boolean = false;
    @observable selectedDeviceOption = this.availableDeviceOptions[0].value;
    @observable targetGroupsStore: ?ResourceListStore;

    @observable previewStore: PreviewStore;
    @observable previewWindow: any;
    @observable webspaceOptions: Array<Object> = [];
    @observable reloadCounter: number = 0;

    typeDisposer: () => mixed;
    dataDisposer: () => mixed;

    constructor(props: Props) {
        super(props);

        const {
            formStore,
            router: {
                attributes: {
                    locale,
                    webspace,
                },
            },
        } = this.props;

        if (Preview.audienceTargeting) {
            const targetGroupsStore = new ResourceListStore('target_groups');
            this.targetGroupsStore = targetGroupsStore;
        }

        this.webspaceOptions = webspaceStore.grantedWebspaces.map((webspace): Object => ({
            label: webspace.name,
            value: webspace.key,
        }));

        this.previewStore = new PreviewStore(
            formStore.resourceKey,
            formStore.id,
            locale,
            webspace || this.webspaceOptions[0].value
        );

        if (Preview.mode === 'auto') {
            this.startPreview();
        }
    }

    @action setStarted = (started: boolean) => {
        this.started = started;
    };

    startPreview = () => {
        const {previewStore} = this;

        const {
            formStore,
        } = this.props;

        previewStore.start();

        when(
            () => !formStore.loading
                && !previewStore.starting
                && this.iframeRef !== null
                && (!this.targetGroupsStore || !this.targetGroupsStore.loading),
            this.initializeReaction
        );

        this.setStarted(true);
    };

    initializeReaction = (): void => {
        const {previewStore} = this;

        const {
            formStore,
        } = this.props;

        this.dataDisposer = reaction(
            () => toJS(formStore.data),
            (data) => {
                this.updatePreview(data);
            }
        );

        this.typeDisposer = reaction(
            () => toJS(formStore.type),
            (type) => {
                previewStore.updateContext(type).then(this.setContent);
            }
        );
    };

    updatePreview = debounce((data: Object) => {
        const {previewStore} = this;
        previewStore.update(data).then(this.setContent);
    }, Preview.debounceDelay);

    setContent = (previewContent: string) => {
        const previewDocument = this.getPreviewDocument();

        if (!previewDocument) {
            return;
        }

        previewDocument.open(); // This will lose in Firefox the and safari previewDocument.location
        previewDocument.write(previewContent);
        previewDocument.close();
    };

    componentWillUnmount() {
        if (this.typeDisposer) {
            this.typeDisposer();
        }

        if (this.dataDisposer) {
            this.dataDisposer();
        }

        if (!this.started) {
            return;
        }

        this.updatePreview.clear();
        this.previewStore.stop();
    }

    getPreviewDocument = (): ?Document => {
        if (this.previewWindow) {
            return this.previewWindow.document;
        }

        if (!(this.iframeRef instanceof HTMLIFrameElement)) {
            return;
        }

        return this.iframeRef.contentDocument;
    };

    @action setIframe = (iframeRef: ?Object) => {
        this.iframeRef = iframeRef;
    };

    handleToggleSidebarClick = () => {
        if (sidebarStore.size === 'medium') {
            return sidebarStore.setSize('large');
        }

        sidebarStore.setSize('medium');
    };

    @action handleDeviceSelectChange = (value: string | number) => {
        this.selectedDeviceOption = value;
    };

    @action handleWebspaceChange = (webspace: string) => {
        this.previewStore.setWebspace(webspace);
    };

    handleTargetGroupChange = (targetGroupId: number) => {
        const {formStore} = this.props;

        this.previewStore.setTargetGroup(targetGroupId);
        this.updatePreview(toJS(formStore.data));
    };

    @action handleRefreshClick = () => {
        // We can not reload the iframe here as safari and firefox
        // resets the location.href to another url on previewDocument.open
        // so instead of this we rerender the whole iframe.
        ++this.reloadCounter;
    };

    handleStartClick = () => {
        this.startPreview();
    };

    @action handlePreviewWindowClick = () => {
        this.previewWindow = window.open(this.previewStore.renderRoute);
        this.previewWindow.addEventListener('beforeunload', action(() => {
            this.previewWindow = undefined;
        }));
    };

    render() {
        const {router} = this.props;
        const {previewWebspaceChooser = true} = router.route.options;

        if (this.previewWindow || (this.targetGroupsStore && this.targetGroupsStore.loading)) {
            return null;
        }

        if (!this.started) {
            return <button onClick={this.handleStartClick}>Start</button>;
        }

        const containerClass = classNames(
            previewStyles.container,
            {
                [previewStyles[this.selectedDeviceOption]]: this.selectedDeviceOption,
            }
        );

        return (
            <div className={containerClass}>
                {this.previewStore.starting
                    ? <div className={previewStyles.loaderContainer}>
                        <Loader />
                    </div>
                    : <div className={previewStyles.previewContainer}>
                        <div className={previewStyles.iframeContainer}>
                            <iframe
                                className={previewStyles.iframe}
                                key={this.reloadCounter}
                                ref={this.setIframe}
                                src={this.previewStore.renderRoute}
                            />
                        </div>
                    </div>
                }
                <Toolbar skin="dark">
                    <Toolbar.Controls grow={true}>
                        <Toolbar.Button
                            icon={sidebarStore.size === 'medium' ? 'su-arrow-left' : 'su-arrow-right'}
                            onClick={this.handleToggleSidebarClick}
                        />
                        <Toolbar.Items>
                            <Toolbar.Select
                                icon="su-expand"
                                onChange={this.handleDeviceSelectChange}
                                options={this.availableDeviceOptions}
                                value={this.selectedDeviceOption}
                            />
                            {previewWebspaceChooser &&
                                <Toolbar.Select
                                    icon="su-webspace"
                                    onChange={this.handleWebspaceChange}
                                    options={this.webspaceOptions}
                                    value={this.previewStore.webspace}
                                />
                            }
                            {!!this.targetGroupsStore &&
                                <Toolbar.Select
                                    icon="su-user"
                                    loading={this.targetGroupsStore.loading}
                                    onChange={this.handleTargetGroupChange}
                                    options={
                                        [
                                            {label: translate('sulu_audience_targeting.no_target_group'), value: -1},
                                            ...(this.targetGroupsStore
                                                ? this.targetGroupsStore.data.map((targetGroup) => ({
                                                    label: targetGroup.title,
                                                    value: targetGroup.id,
                                                }))
                                                : []
                                            ),
                                        ]
                                    }
                                    value={this.previewStore && this.previewStore.targetGroup}
                                />
                            }
                            <Toolbar.Button
                                icon="su-sync"
                                onClick={this.handleRefreshClick}
                            >
                                {translate('sulu_preview.reload')}
                            </Toolbar.Button>
                            <Toolbar.Button
                                icon="su-link"
                                onClick={this.handlePreviewWindowClick}
                            >
                                {translate('sulu_preview.open_in_window')}
                            </Toolbar.Button>
                        </Toolbar.Items>
                    </Toolbar.Controls>
                </Toolbar>
            </div>
        );
    }
}

export default Preview;
