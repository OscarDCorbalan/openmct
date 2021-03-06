/*****************************************************************************
 * Open MCT Web, Copyright (c) 2014-2015, United States Government
 * as represented by the Administrator of the National Aeronautics and Space
 * Administration. All rights reserved.
 *
 * Open MCT Web is licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0.
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 *
 * Open MCT Web includes source code licensed under additional open source
 * licenses. See the Open Source Licenses file (LICENSES.md) included with
 * this source code distribution or the Licensing information page available
 * at runtime from the About dialog for additional information.
 *****************************************************************************/

/**
 *  SearchSpec. Created by shale on 07/31/2015.
 */
define([
    "../../src/services/GenericSearchProvider"
], function (
    GenericSearchProvider
) {

    describe('GenericSearchProvider', function () {
        var $q,
            $log,
            modelService,
            models,
            workerService,
            worker,
            topic,
            mutationTopic,
            ROOTS,
            provider;

        beforeEach(function () {
            $q = jasmine.createSpyObj(
                '$q',
                ['defer']
            );
            $log = jasmine.createSpyObj(
                '$log',
                ['warn']
            );
            models = {};
            modelService = jasmine.createSpyObj(
                'modelService',
                ['getModels']
            );
            modelService.getModels.andReturn(Promise.resolve(models));
            workerService = jasmine.createSpyObj(
                'workerService',
                ['run']
            );
            worker = jasmine.createSpyObj(
                'worker',
                [
                    'postMessage',
                    'addEventListener'
                ]
            );
            workerService.run.andReturn(worker);
            topic = jasmine.createSpy('topic');
            mutationTopic = jasmine.createSpyObj(
                'mutationTopic',
                ['listen']
            );
            topic.andReturn(mutationTopic);
            ROOTS = [
                'mine'
            ];

            spyOn(GenericSearchProvider.prototype, 'scheduleForIndexing');

            provider = new GenericSearchProvider(
                $q,
                $log,
                modelService,
                workerService,
                topic,
                ROOTS
            );
        });

        it('listens for general mutation', function () {
            expect(topic).toHaveBeenCalledWith('mutation');
            expect(mutationTopic.listen)
                .toHaveBeenCalledWith(jasmine.any(Function));
        });

        it('re-indexes when mutation occurs', function () {
            var mockDomainObject =
                    jasmine.createSpyObj('domainObj', [
                        'getId',
                        'getModel',
                        'getCapability'
                    ]),
                testModel = { some: 'model' };
            mockDomainObject.getId.andReturn("some-id");
            mockDomainObject.getModel.andReturn(testModel);
            spyOn(provider, 'index').andCallThrough();
            mutationTopic.listen.mostRecentCall.args[0](mockDomainObject);
            expect(provider.index).toHaveBeenCalledWith('some-id', testModel);
        });

        it('starts indexing roots', function () {
            expect(provider.scheduleForIndexing).toHaveBeenCalledWith('mine');
        });

        it('runs a worker', function () {
            expect(workerService.run)
                .toHaveBeenCalledWith('genericSearchWorker');
        });

        it('listens for messages from worker', function () {
            expect(worker.addEventListener)
                .toHaveBeenCalledWith('message', jasmine.any(Function));
            spyOn(provider, 'onWorkerMessage');
            worker.addEventListener.mostRecentCall.args[1]('mymessage');
            expect(provider.onWorkerMessage).toHaveBeenCalledWith('mymessage');
        });

        it('has a maximum number of concurrent requests', function () {
            expect(provider.MAX_CONCURRENT_REQUESTS).toBe(100);
        });

        describe('scheduleForIndexing', function () {
            beforeEach(function () {
                provider.scheduleForIndexing.andCallThrough();
                spyOn(provider, 'keepIndexing');
            });

            it('tracks ids to index', function () {
                expect(provider.indexedIds.a).not.toBeDefined();
                expect(provider.pendingIndex.a).not.toBeDefined();
                expect(provider.idsToIndex).not.toContain('a');
                provider.scheduleForIndexing('a');
                expect(provider.indexedIds.a).toBeDefined();
                expect(provider.pendingIndex.a).toBeDefined();
                expect(provider.idsToIndex).toContain('a');
            });

            it('calls keep indexing', function () {
                provider.scheduleForIndexing('a');
                expect(provider.keepIndexing).toHaveBeenCalled();
            });
        });

        describe('keepIndexing', function () {
            it('calls beginIndexRequest until at maximum', function () {
                spyOn(provider, 'beginIndexRequest').andCallThrough();
                provider.pendingRequests = 9;
                provider.idsToIndex = ['a', 'b', 'c'];
                provider.MAX_CONCURRENT_REQUESTS = 10;
                provider.keepIndexing();
                expect(provider.beginIndexRequest).toHaveBeenCalled();
                expect(provider.beginIndexRequest.calls.length).toBe(1);
            });

            it('calls beginIndexRequest for all ids to index', function () {
                spyOn(provider, 'beginIndexRequest').andCallThrough();
                provider.pendingRequests = 0;
                provider.idsToIndex = ['a', 'b', 'c'];
                provider.MAX_CONCURRENT_REQUESTS = 10;
                provider.keepIndexing();
                expect(provider.beginIndexRequest).toHaveBeenCalled();
                expect(provider.beginIndexRequest.calls.length).toBe(3);
            });

            it('does not index when at capacity', function () {
                spyOn(provider, 'beginIndexRequest');
                provider.pendingRequests = 10;
                provider.idsToIndex.push('a');
                provider.MAX_CONCURRENT_REQUESTS = 10;
                provider.keepIndexing();
                expect(provider.beginIndexRequest).not.toHaveBeenCalled();
            });

            it('does not index when no ids to index', function () {
                spyOn(provider, 'beginIndexRequest');
                provider.pendingRequests = 0;
                provider.MAX_CONCURRENT_REQUESTS = 10;
                provider.keepIndexing();
                expect(provider.beginIndexRequest).not.toHaveBeenCalled();
            });
        });

        describe('index', function () {
            it('sends index message to worker', function () {
                var id = 'anId',
                    model = {};

                provider.index(id, model);
                expect(worker.postMessage).toHaveBeenCalledWith({
                    request: 'index',
                    id: id,
                    model: model
                });
            });

            it('schedules composed ids for indexing', function () {
                var id = 'anId',
                    model = {composition: ['abc', 'def']};

                provider.index(id, model);
                expect(provider.scheduleForIndexing)
                    .toHaveBeenCalledWith('abc');
                expect(provider.scheduleForIndexing)
                    .toHaveBeenCalledWith('def');
            });
        });

        describe('beginIndexRequest', function () {

            beforeEach(function () {
                provider.pendingRequests = 0;
                provider.pendingIds = {'abc': true};
                provider.idsToIndex = ['abc'];
                models.abc = {};
                spyOn(provider, 'index');
            });

            it('removes items from queue', function () {
                provider.beginIndexRequest();
                expect(provider.idsToIndex.length).toBe(0);
            });

            it('tracks number of pending requests', function () {
                provider.beginIndexRequest();
                expect(provider.pendingRequests).toBe(1);
                waitsFor(function () {
                    return provider.pendingRequests === 0;
                });
                runs(function () {
                    expect(provider.pendingRequests).toBe(0);
                });
            });

            it('indexes objects', function () {
                provider.beginIndexRequest();
                waitsFor(function () {
                    return provider.pendingRequests === 0;
                });
                runs(function () {
                    expect(provider.index)
                        .toHaveBeenCalledWith('abc', models.abc);
                });
            });

        });


        it('can dispatch searches to worker', function () {
            spyOn(provider, 'makeQueryId').andReturn(428);
            expect(provider.dispatchSearch('searchTerm', 100))
                .toBe(428);

            expect(worker.postMessage).toHaveBeenCalledWith({
                request: 'search',
                input: 'searchTerm',
                maxResults: 100,
                queryId: 428
            });
        });

        it('can generate queryIds', function () {
            expect(provider.makeQueryId()).toEqual(jasmine.any(Number));
        });

        it('can query for terms', function () {
            var deferred = {promise: {}};
            spyOn(provider, 'dispatchSearch').andReturn(303);
            $q.defer.andReturn(deferred);

            expect(provider.query('someTerm', 100)).toBe(deferred.promise);
            expect(provider.pendingQueries[303]).toBe(deferred);
        });

        describe('onWorkerMessage', function () {
            var pendingQuery;
            beforeEach(function () {
                pendingQuery = jasmine.createSpyObj(
                    'pendingQuery',
                    ['resolve']
                );
                provider.pendingQueries[143] = pendingQuery;
            });

            it('resolves pending searches', function () {
                provider.onWorkerMessage({
                    data: {
                        request: 'search',
                        total: 2,
                        results: [
                            {
                                item: {
                                    id: 'abc',
                                    model: {id: 'abc'}
                                },
                                matchCount: 4
                            },
                            {
                                item: {
                                    id: 'def',
                                    model: {id: 'def'}
                                },
                                matchCount: 2
                            }
                        ],
                        queryId: 143
                    }
                });

                expect(pendingQuery.resolve)
                    .toHaveBeenCalledWith({
                        total: 2,
                        hits: [{
                            id: 'abc',
                            model: {id: 'abc'},
                            score: 4
                        }, {
                            id: 'def',
                            model: {id: 'def'},
                            score: 2
                        }]
                    });

                    expect(provider.pendingQueries[143]).not.toBeDefined();

            });

        });

    });
});
