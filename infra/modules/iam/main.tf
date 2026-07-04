# Least-privilege IAM (CONVENTIONS §8, DESIGN §9). One execution role per Lambda,
# scoped exactly to the resources each handler touches — no wildcard resource
# ARNs. Plus the EventBridge Scheduler role the app passes when arming one-shot
# auto-pick schedules.

locals {
  schedule_arn_pattern = "arn:aws:scheduler:${var.region}:${var.account_id}:schedule/${var.scheduler_group_name}/*"

  log_group_arns = {
    for k, name in var.fn_names :
    k => "arn:aws:logs:${var.region}:${var.account_id}:log-group:/aws/lambda/${name}:*"
  }

  ssm_param_arns = [var.ssm_passcode_hash_arn, var.ssm_hmac_key_arn]
}

# --- Assume-role trust policies ----------------------------------------------
data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

# --- Roles -------------------------------------------------------------------
resource "aws_iam_role" "ws_connect" {
  name               = "${var.fn_names.ws_connect}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = var.tags
}

resource "aws_iam_role" "ws_disconnect" {
  name               = "${var.fn_names.ws_disconnect}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = var.tags
}

resource "aws_iam_role" "ws_action" {
  name               = "${var.fn_names.ws_action}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = var.tags
}

resource "aws_iam_role" "http" {
  name               = "${var.fn_names.http}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = var.tags
}

resource "aws_iam_role" "autopick" {
  name               = "${var.fn_names.autopick}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = var.tags
}

resource "aws_iam_role" "scheduler" {
  name               = var.scheduler_role_name
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
  tags               = var.tags
}

# --- Reusable statement fragments --------------------------------------------
# CloudWatch Logs, scoped to each function's own log group.
data "aws_iam_policy_document" "logs" {
  for_each = var.fn_names
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [local.log_group_arns[each.key]]
  }
}

# --- ws-connect / ws-disconnect ----------------------------------------------
# Only write/delete the CONN# item.
data "aws_iam_policy_document" "ws_connect" {
  source_policy_documents = [data.aws_iam_policy_document.logs["ws_connect"].json]
  statement {
    sid       = "ConnItem"
    actions   = ["dynamodb:PutItem", "dynamodb:DeleteItem"]
    resources = [var.table_arn]
  }
}

data "aws_iam_policy_document" "ws_disconnect" {
  source_policy_documents = [data.aws_iam_policy_document.logs["ws_disconnect"].json]
  statement {
    sid       = "ConnItem"
    actions   = ["dynamodb:PutItem", "dynamodb:DeleteItem"]
    resources = [var.table_arn]
  }
}

# --- ws-action ---------------------------------------------------------------
data "aws_iam_policy_document" "ws_action" {
  source_policy_documents = [data.aws_iam_policy_document.logs["ws_action"].json]

  statement {
    sid = "DraftState"
    actions = [
      "dynamodb:Query",
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:BatchWriteItem",
      "dynamodb:TransactWriteItems",
    ]
    resources = [var.table_arn]
  }

  statement {
    sid       = "ManageConnections"
    actions   = ["execute-api:ManageConnections"]
    resources = [var.ws_manage_connections_arn]
  }

  statement {
    sid       = "ReadSecrets"
    actions   = ["ssm:GetParameter"]
    resources = local.ssm_param_arns
  }

  statement {
    sid       = "ArmSchedules"
    actions   = ["scheduler:CreateSchedule", "scheduler:UpdateSchedule", "scheduler:DeleteSchedule"]
    resources = [local.schedule_arn_pattern]
  }

  statement {
    sid       = "PassSchedulerRole"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.scheduler.arn]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["scheduler.amazonaws.com"]
    }
  }
}

# --- http --------------------------------------------------------------------
data "aws_iam_policy_document" "http" {
  source_policy_documents = [data.aws_iam_policy_document.logs["http"].json]

  statement {
    sid = "SetupState"
    actions = [
      "dynamodb:Query",
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:BatchWriteItem",
      "dynamodb:TransactWriteItems",
    ]
    resources = [var.table_arn]
  }

  statement {
    sid       = "ReadSecrets"
    actions   = ["ssm:GetParameter"]
    resources = local.ssm_param_arns
  }
}

# --- autopick ----------------------------------------------------------------
data "aws_iam_policy_document" "autopick" {
  source_policy_documents = [data.aws_iam_policy_document.logs["autopick"].json]

  statement {
    sid = "DraftState"
    actions = [
      "dynamodb:Query",
      "dynamodb:GetItem",
      "dynamodb:TransactWriteItems",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
    ]
    resources = [var.table_arn]
  }

  statement {
    sid       = "ReadPool"
    actions   = ["s3:GetObject"]
    resources = ["${var.pool_bucket_arn}/${var.pool_prefix}*"]
  }

  statement {
    sid       = "ManageConnections"
    actions   = ["execute-api:ManageConnections"]
    resources = [var.ws_manage_connections_arn]
  }

  statement {
    sid       = "ArmSchedules"
    actions   = ["scheduler:CreateSchedule", "scheduler:UpdateSchedule", "scheduler:DeleteSchedule"]
    resources = [local.schedule_arn_pattern]
  }

  statement {
    sid       = "PassSchedulerRole"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.scheduler.arn]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["scheduler.amazonaws.com"]
    }
  }
}

# --- scheduler role: invoke autopick only ------------------------------------
data "aws_iam_policy_document" "scheduler" {
  statement {
    sid       = "InvokeAutopick"
    actions   = ["lambda:InvokeFunction"]
    resources = [var.autopick_arn]
  }
}

# --- Attach inline policies --------------------------------------------------
resource "aws_iam_role_policy" "ws_connect" {
  name   = "policy"
  role   = aws_iam_role.ws_connect.id
  policy = data.aws_iam_policy_document.ws_connect.json
}

resource "aws_iam_role_policy" "ws_disconnect" {
  name   = "policy"
  role   = aws_iam_role.ws_disconnect.id
  policy = data.aws_iam_policy_document.ws_disconnect.json
}

resource "aws_iam_role_policy" "ws_action" {
  name   = "policy"
  role   = aws_iam_role.ws_action.id
  policy = data.aws_iam_policy_document.ws_action.json
}

resource "aws_iam_role_policy" "http" {
  name   = "policy"
  role   = aws_iam_role.http.id
  policy = data.aws_iam_policy_document.http.json
}

resource "aws_iam_role_policy" "autopick" {
  name   = "policy"
  role   = aws_iam_role.autopick.id
  policy = data.aws_iam_policy_document.autopick.json
}

resource "aws_iam_role_policy" "scheduler" {
  name   = "policy"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler.json
}
