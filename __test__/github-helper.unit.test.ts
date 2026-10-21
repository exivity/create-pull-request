import {GitHubHelper} from '../lib/github-helper'
import {Octokit} from '../lib/octokit-client'
import {Inputs} from '../src/create-pull-request'

jest.mock('../lib/octokit-client', () => ({Octokit: jest.fn()}))

const inputs: Inputs = {
  token: 'test-token',
  path: '',
  addPaths: [],
  commitMessage: 'Prepare release',
  committer: '',
  author: '',
  signoff: false,
  branch: 'maintenance/v3.39.3',
  deleteBranch: false,
  branchSuffix: '',
  base: 'main',
  pushToFork: '',
  title: 'Prepare maintenance release',
  body: 'Verified release plan',
  labels: [],
  assignees: [],
  reviewers: [],
  teamReviewers: [],
  milestone: 0,
  draft: true
}

describe('GitHubHelper pull request creation and updates', () => {
  const create = jest.fn()
  const list = jest.fn()
  const update = jest.fn()
  let helper: GitHubHelper

  beforeEach(() => {
    create.mockReset()
    list.mockReset()
    update.mockReset()
    ;(Octokit as unknown as jest.Mock).mockImplementation(() => ({
      rest: {pulls: {create, list, update}}
    }))
    helper = new GitHubHelper('test-token')
  })

  function existingPull(): void {
    create.mockRejectedValue(
      new Error('A pull request already exists for exivity:maintenance/v3.39.3')
    )
  }

  test('creates a new pull request without an existing-PR lookup', async () => {
    create.mockResolvedValue({
      data: {
        number: 139,
        html_url: 'https://github.com/exivity/exivity/pull/139'
      }
    })

    await expect(
      helper.createOrUpdatePullRequest(
        inputs,
        'exivity/exivity',
        'exivity/exivity'
      )
    ).resolves.toMatchObject({number: 139, created: true})
    expect(list).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  test.each([
    ['exivity/exivity', 'exivity:maintenance/v3.39.3'],
    ['contributor/exivity-fork', 'contributor:maintenance/v3.39.3']
  ])(
    'updates a PR from %s using the owner:branch filter',
    async (repo, head) => {
      existingPull()
      list.mockResolvedValue({data: [{number: 139}]})
      update.mockResolvedValue({
        data: {
          number: 139,
          html_url: 'https://github.com/exivity/exivity/pull/139'
        }
      })

      await expect(
        helper.createOrUpdatePullRequest(inputs, 'exivity/exivity', repo)
      ).resolves.toMatchObject({number: 139, created: false})
      expect(list).toHaveBeenCalledWith({
        owner: 'exivity',
        repo: 'exivity',
        state: 'open',
        head,
        base: 'main'
      })
      expect(update).toHaveBeenCalledWith({
        owner: 'exivity',
        repo: 'exivity',
        pull_number: 139,
        title: inputs.title,
        body: inputs.body
      })
    }
  )

  test.each([0, 2])(
    'does not update a PR when the lookup returns %s matches',
    async count => {
      existingPull()
      list.mockResolvedValue({
        data: Array.from({length: count}, (_, index) => ({number: index + 1}))
      })

      await expect(
        helper.createOrUpdatePullRequest(
          inputs,
          'exivity/exivity',
          'exivity/exivity'
        )
      ).rejects.toThrow(
        `Expected one open pull request for exivity:maintenance/v3.39.3 => main in exivity/exivity, found ${count}`
      )
      expect(update).not.toHaveBeenCalled()
    }
  )

  test('does not hide unrelated creation errors', async () => {
    create.mockRejectedValue(new Error('Bad credentials'))

    await expect(
      helper.createOrUpdatePullRequest(
        inputs,
        'exivity/exivity',
        'exivity/exivity'
      )
    ).rejects.toThrow('Bad credentials')
    expect(list).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})
